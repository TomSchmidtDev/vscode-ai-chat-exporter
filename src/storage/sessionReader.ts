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
 *   kind=0  { v: RawChatSession }                    — base snapshot (requests always [])
 *   kind=1  { k: (string|number)[], v: unknown }     — scalar SET at key path
 *   kind=2  { k: (string|number)[], v: unknown }     — array CONCAT or deep SET
 *
 * kind=2 semantics depend on the key path:
 *   - All-string path ending at an existing array + array value → CONCAT (append new items).
 *     This is how new requests are added one-by-one to the session.
 *   - Path containing a numeric index → navigate into that array element and SET the leaf.
 *     This is how a completed response is attached to a specific request, e.g.
 *     k=["requests", 2, "response"].
 * kind=1 always SETs (replaces) the leaf, including for array fields.
 */
function parseJsonlSession(content: string): RawChatSession | null {
  let session: Record<string, unknown> | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const obj = JSON.parse(trimmed) as { kind?: number; k?: (string | number)[]; v?: unknown };
      if (obj.kind === 0 && obj.v && typeof obj.v === 'object') {
        // Clone the base snapshot so patches don't mutate the parsed object
        session = { ...(obj.v as Record<string, unknown>) };
      } else if ((obj.kind === 1 || obj.kind === 2) && session && Array.isArray(obj.k) && obj.k.length > 0) {
        applyJsonlPatch(session, obj.k, obj.v, obj.kind);
      }
    } catch {
      // skip malformed lines
    }
  }

  return session as RawChatSession | null;
}

/**
 * Applies a JSONL patch to `target` at the nested path `keys`.
 *
 * For kind=2 with an all-string key path where the target leaf is already an
 * array and the incoming value is also an array, the items are CONCATENATED
 * (appended) rather than replaced.  This matches how Copilot Chat appends
 * new requests to a session incrementally.
 *
 * For kind=1, or any path containing a numeric index, the leaf is always SET
 * (replaced).
 */
function applyJsonlPatch(
  target: Record<string, unknown>,
  keys: (string | number)[],
  value: unknown,
  kind: number
): void {
  const hasNumericKey = keys.some(k => typeof k === 'number');

  // Navigate to the parent node, handling numeric indices as array accesses
  let node: unknown = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof key === 'number') {
      node = (node as unknown[])[key];
    } else {
      const obj = node as Record<string, unknown>;
      if (obj[key] == null || typeof obj[key] !== 'object') {
        obj[key] = {};
      }
      node = obj[key];
    }
    if (node == null) return; // path doesn't exist, skip safely
  }

  const lastKey = keys[keys.length - 1];

  // kind=2 with all-string path: CONCAT arrays (incremental request append)
  if (kind === 2 && !hasNumericKey && typeof lastKey === 'string') {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj[lastKey]) && Array.isArray(value)) {
      obj[lastKey] = [...(obj[lastKey] as unknown[]), ...value];
      return;
    }
  }

  // Default: SET (replace)
  if (typeof lastKey === 'number') {
    (node as unknown[])[lastKey] = value;
  } else {
    (node as Record<string, unknown>)[lastKey] = value;
  }
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
