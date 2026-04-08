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
 * .jsonl format: one JSON object per line.
 * Each line has { kind: number, v: RawChatSession }.
 * kind=0 carries the full session snapshot; take the last one to get the
 * most current state.
 */
function parseJsonlSession(content: string): RawChatSession | null {
  let session: RawChatSession | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const obj = JSON.parse(trimmed) as { kind?: number; v?: RawChatSession };
      if (obj.kind === 0 && obj.v) {
        session = obj.v;
      }
    } catch {
      // skip malformed lines
    }
  }

  return session;
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
      segments.push((part as { value: string }).value);
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
