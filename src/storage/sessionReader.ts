import * as fs from 'fs';
import { RawChatSession, RawResponsePart, ChatSession, ChatMessage } from '../types';

export async function readSessionFile(filePath: string): Promise<RawChatSession | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content) as RawChatSession;
  } catch {
    return null;
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

  return {
    id: raw.sessionId,
    workspaceHash,
    workspaceDisplayName,
    title,
    createdAt: raw.creationDate,
    lastMessageAt: raw.lastMessageDate,
    mode: raw.mode?.id ?? 'chat',
    modelName: raw.selectedModel?.metadata?.name ?? raw.selectedModel?.identifier ?? 'Unknown',
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
