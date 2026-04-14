import * as fs from 'fs';
import { RawChatSession, RawResponsePart, ChatSession, ChatMessage } from '../types';

export async function readSessionFile(filePath: string): Promise<RawChatSession | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');

    if (filePath.endsWith('.jsonl')) {
      return parseJsonlSession(content);
    }

    return JSON.parse(content) as RawChatSession;
  } catch {
    return null;
  }
}

/**
 * .jsonl format: one JSON object per line, three entry kinds:
 *   kind=0  { v: RawChatSession }         — base snapshot (requests always [])
 *   kind=1  { k: string[], v: unknown }   — scalar field patch  (set nested key)
 *   kind=2  { k: string[], v: unknown }   — array/value replace (set nested key)
 *
 * kind=1 and kind=2 use identical patch semantics: walk the key path and set
 * the leaf.  The LAST kind=2 entry for key ["requests"] holds the complete
 * conversation history.
 */
function parseJsonlSession(content: string): RawChatSession | null {
  let session: Record<string, unknown> | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const obj = JSON.parse(trimmed) as { kind?: number; k?: string[]; v?: unknown };
      if (obj.kind === 0 && obj.v && typeof obj.v === 'object') {
        // Clone the base snapshot so patches don't mutate the parsed object
        session = { ...(obj.v as Record<string, unknown>) };
      } else if ((obj.kind === 1 || obj.kind === 2) && session && Array.isArray(obj.k) && obj.k.length > 0) {
        applyJsonlPatch(session, obj.k, obj.v);
      }
    } catch {
      // skip malformed lines
    }
  }

  return session as RawChatSession | null;
}

/**
 * Sets a value at the nested path described by `keys` inside `target`.
 * Intermediate objects are created if missing.
 */
function applyJsonlPatch(target: Record<string, unknown>, keys: string[], value: unknown): void {
  let node: Record<string, unknown> = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (node[key] == null || typeof node[key] !== 'object') {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

export function normalizeSession(
  raw: RawChatSession,
  workspaceHash: string,
  workspaceDisplayName: string
): ChatSession {
  const messages: ChatMessage[] = [];

  for (const req of raw.requests) {
    const userText = req.message.text.trim();
    if (userText) {
      messages.push({
        id: `${req.requestId}-user`,
        role: 'user',
        text: userText,
        timestamp: req.timestamp,
        agentName: req.agent?.name,
        slashCommand: req.slashCommand?.name ? `/${req.slashCommand.name}` : undefined,
      });
    }

    const assistantText = reconstructResponseText(req.response);
    if (assistantText.trim()) {
      messages.push({
        id: `${req.requestId}-assistant`,
        role: 'assistant',
        text: assistantText,
        timestamp: req.timestamp ? req.timestamp + 1 : undefined,
      });
    }
  }

  const title = raw.customTitle
    ?? messages.find(m => m.role === 'user')?.text.slice(0, 60).replace(/\n/g, ' ')
    ?? raw.sessionId;

  const lastTimestamp = messages.filter(m => m.timestamp).at(-1)?.timestamp;
  const selectedModel = raw.selectedModel ?? raw.inputState?.selectedModel;

  return {
    id: raw.sessionId,
    workspaceHash,
    workspaceDisplayName,
    title,
    createdAt: raw.creationDate,
    lastMessageAt: raw.lastMessageDate ?? lastTimestamp ?? raw.creationDate,
    mode: raw.mode?.id ?? 'chat',
    modelName: selectedModel?.metadata?.name ?? selectedModel?.identifier ?? 'Unknown',
    messages,
  };
}

function reconstructResponseText(parts: RawResponsePart[]): string {
  const segments: string[] = [];

  for (const part of parts) {
    if (!('kind' in part)) {
      const v = (part as { value?: unknown }).value;
      if (typeof v === 'string') { segments.push(v); }
    } else if (part.kind === 'codeblockUri') {
      const p = part as { kind: string; uri: { fsPath?: string; path?: string } };
      const fsPath = p.uri?.fsPath ?? p.uri?.path ?? '';
      if (fsPath) {
        const filename = fsPath.replace(/\\/g, '/').split('/').pop() ?? fsPath;
        segments.push(`// ${filename}\n`);
      }
    } else if (part.kind === 'inlineReference') {
      const p = part as { kind: string; inlineReference: { name: string } };
      segments.push(`\`${p.inlineReference?.name ?? ''}\``);
    }
  }

  return segments.join('');
}
