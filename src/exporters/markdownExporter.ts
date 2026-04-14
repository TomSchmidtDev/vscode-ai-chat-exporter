import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChatSession } from '../types';
import { t } from '../i18n';

export class MarkdownExporter {
  /**
   * @param outputPath  Either a concrete file path (single-session Save As)
   *                    or a directory path (multi-session folder export).
   */
  async exportSessions(
    sessions: ChatSession[],
    messageFilters: Record<string, string[]>,
    outputPath: string
  ): Promise<string[]> {
    const exported: string[] = [];
    for (const session of sessions) {
      // If outputPath already has a .md extension it IS the target file;
      // otherwise treat it as a directory and generate a filename.
      const filePath = path.extname(outputPath).toLowerCase() === '.md'
        ? outputPath
        : path.join(outputPath, makeFilename(session, 'md'));
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
    lines.push(`**${t('metaWorkspace')}**: ${session.workspaceDisplayName}  `);
    lines.push(`**${t('metaDate')}**: ${new Date(session.createdAt).toLocaleString()}  `);
    lines.push(`**${t('metaMode')}**: ${session.mode}  `);
    lines.push(`**${t('metaModel')}**: ${session.modelName}  `);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push(`## ${t('headerYou')}`);
      if (msg.agentName || msg.slashCommand) {
        lines.push(`> *${[msg.agentName, msg.slashCommand].filter(Boolean).join(' ')}*`);
        lines.push('');
      }
      lines.push(msg.text);
    } else {
      lines.push(`## ${t('headerCopilot')}`);
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

export function makeFilename(session: ChatSession, ext: string): string {
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
