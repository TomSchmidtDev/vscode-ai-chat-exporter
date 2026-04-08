import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatSession } from '../types';

export class MarkdownExporter {
  async exportSessions(
    sessions: ChatSession[],
    messageFilters: Record<string, string[]>
  ): Promise<string[]> {
    const outputDir = await pickOutputDir();
    if (!outputDir) {
      return [];
    }

    const exported: string[] = [];
    for (const session of sessions) {
      const filePath = path.join(outputDir, makeFilename(session, 'md'));
      const content = renderSession(session, messageFilters[session.id]);
      await fs.promises.writeFile(filePath, content, 'utf8');
      exported.push(filePath);
    }
    return exported;
  }
}

function renderSession(session: ChatSession, selectedIds?: string[]): string {
  const config = vscode.workspace.getConfiguration('aiChatExporter');
  const includeMetadata = config.get<boolean>('includeMetadata', true);

  const messages = selectedIds
    ? session.messages.filter(m => selectedIds.includes(m.id))
    : session.messages;

  const lines: string[] = [];

  lines.push(`# ${escapeMarkdown(session.title)}`);
  lines.push('');

  if (includeMetadata) {
    lines.push(`**Workspace**: ${session.workspaceDisplayName}  `);
    lines.push(`**Date**: ${new Date(session.createdAt).toLocaleString()}  `);
    lines.push(`**Mode**: ${session.mode}  `);
    lines.push(`**Model**: ${session.modelName}  `);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('## You');
      if (msg.agentName || msg.slashCommand) {
        lines.push(`> *${[msg.agentName, msg.slashCommand].filter(Boolean).join(' ')}*`);
        lines.push('');
      }
      lines.push(msg.text);
    } else {
      lines.push('## GitHub Copilot');
      if (msg.timestamp) {
        lines.push(`*${new Date(msg.timestamp).toLocaleTimeString()}*`);
        lines.push('');
      }
      lines.push(msg.text);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function makeFilename(session: ChatSession, ext: string): string {
  const date = new Date(session.createdAt).toISOString().slice(0, 10);
  const safe = session.title
    .replace(/[<>:"/\\|?*\n\r]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .trim();
  const name = safe || session.id.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 36) || 'session';
  return `${date}_${name}.${ext}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

async function pickOutputDir(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('aiChatExporter');
  const configured = config.get<string>('outputDirectory', '');
  if (configured) {
    return configured;
  }

  const chosen = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Export Folder',
  });
  return chosen?.[0]?.fsPath;
}

export { makeFilename, pickOutputDir };
