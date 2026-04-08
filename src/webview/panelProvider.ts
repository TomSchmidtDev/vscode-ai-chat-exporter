import * as vscode from 'vscode';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { ExtensionToWebview, WebviewToExtension, ChatSession, ChatWorkspace } from '../types';
import { getWorkspaceStorageBase } from '../storage/pathResolver';
import { discoverAllWorkspaces } from '../storage/workspaceDiscovery';
import { readSessionFile, normalizeSession } from '../storage/sessionReader';
import { MarkdownExporter } from '../exporters/markdownExporter';
import { HtmlExporter } from '../exporters/htmlExporter';

export class ChatExporterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'aiChatExporter.mainView';

  private _view?: vscode.WebviewView;
  private _sessions: Map<string, ChatSession> = new Map();

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (msg: WebviewToExtension) => this._handleMessage(msg),
      undefined,
      this.context.subscriptions
    );
  }

  refresh(): void {
    this._post({ type: 'loading' });
    this._loadSessions();
  }

  private async _handleMessage(msg: WebviewToExtension): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this._loadSessions();
        break;
      case 'refresh':
        await this._loadSessions();
        break;
      case 'preview':
        this._sendPreview(msg.sessionId);
        break;
      case 'exportMd':
        if (!Array.isArray(msg.sessionIds) || typeof msg.messageFilters !== 'object' || !msg.messageFilters) { return; }
        await this._exportMd(msg.sessionIds, msg.messageFilters);
        break;
      case 'exportHtml':
        if (!Array.isArray(msg.sessionIds) || typeof msg.messageFilters !== 'object' || !msg.messageFilters) { return; }
        await this._exportHtml(msg.sessionIds, msg.messageFilters, msg.theme);
        break;
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'aiChatExporter');
        break;
    }
  }

  private async _loadSessions(): Promise<void> {
    this._post({ type: 'loading' });
    this._sessions.clear();

    try {
      const storageBase = getWorkspaceStorageBase();
      const workspaces = await discoverAllWorkspaces(storageBase);
      const chatWorkspaces: ChatWorkspace[] = [];

      for (const ws of workspaces) {
        const sessions: ChatSession[] = [];

        for (const file of ws.chatSessionFiles) {
          try {
            const raw = await readSessionFile(file);
            if (!raw || raw.requests.length === 0) {
              continue;
            }
            const session = normalizeSession(raw, ws.hash, ws.displayName);
            this._sessions.set(session.id, session);
            sessions.push(session);
          } catch {
            // skip malformed file, continue with remaining files
          }
        }

        if (sessions.length > 0) {
          sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
          chatWorkspaces.push({
            hash: ws.hash,
            folderUri: ws.folderUri,
            displayName: ws.displayName,
            sessions,
          });
        }
      }

      this._post({ type: 'sessions', data: chatWorkspaces });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ type: 'error', message });
    }
  }

  private _sendPreview(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    const exporter = new HtmlExporter();
    const html = exporter.renderPreview(session);
    this._post({ type: 'preview', html });
  }

  private async _exportMd(
    sessionIds: string[],
    messageFilters: Record<string, string[]>
  ): Promise<void> {
    const sessions = this._resolveSessions(sessionIds);
    if (sessions.length === 0) {
      vscode.window.showWarningMessage('No sessions selected for export.');
      return;
    }

    try {
      const exporter = new MarkdownExporter();
      const exported = await exporter.exportSessions(sessions, messageFilters);
      if (exported.length > 0) {
        this._post({ type: 'exportDone', path: path.dirname(exported[0]), count: exported.length });
        const open = await vscode.window.showInformationMessage(
          `Exported ${exported.length} session(s) to Markdown.`,
          'Open Folder'
        );
        if (open === 'Open Folder') {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(exported[0])));
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${message}`);
    }
  }

  private async _exportHtml(
    sessionIds: string[],
    messageFilters: Record<string, string[]>,
    theme: string
  ): Promise<void> {
    const sessions = this._resolveSessions(sessionIds);
    if (sessions.length === 0) {
      vscode.window.showWarningMessage('No sessions selected for export.');
      return;
    }

    try {
      const exporter = new HtmlExporter();
      const exported = await exporter.exportSessions(sessions, messageFilters, theme);
      if (exported.length > 0) {
        this._post({ type: 'exportDone', path: path.dirname(exported[0]), count: exported.length });
        const open = await vscode.window.showInformationMessage(
          `Exported ${exported.length} session(s) to HTML.`,
          'Open Folder'
        );
        if (open === 'Open Folder') {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(exported[0])));
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${message}`);
    }
  }

  private _resolveSessions(sessionIds: string[]): ChatSession[] {
    return sessionIds
      .map(id => this._sessions.get(id))
      .filter((s): s is ChatSession => s !== undefined);
  }

  private _post(msg: ExtensionToWebview): void {
    this._view?.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.css')
    );
    const nonce = generateNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

  <link rel="stylesheet" href="${styleUri}">
  <title>AI Chat Exporter</title>
</head>
<body>
<div id="root">
  <div id="toolbar">
    <button id="btn-refresh" class="secondary" title="Refresh sessions">&#8635; Refresh</button>
    <button id="btn-export-md" title="Export selected sessions to Markdown">Export MD</button>
    <button id="btn-export-html" title="Export selected sessions to HTML">Export HTML</button>
    <select id="theme-select" title="HTML export theme">
      <option value="github-dark">GitHub Dark</option>
      <option value="catppuccin-mocha">Catppuccin Mocha</option>
      <option value="dracula">Dracula</option>
      <option value="nord">Nord</option>
      <option value="solarized-dark">Solarized Dark</option>
      <option value="monokai-pro">Monokai Pro</option>
      <option value="tokyo-night">Tokyo Night</option>
      <option value="material-ocean">Material Ocean</option>
      <option value="one-dark">One Dark</option>
      <option value="light-classic">Light Classic</option>
      <option value="custom">Custom</option>
    </select>
    <button id="btn-settings" class="secondary" title="Open settings">&#9881;</button>
  </div>
  <div id="main">
    <div id="session-panel">
      <div id="session-actions">
        <button id="btn-select-all" class="secondary">All</button>
        <button id="btn-select-none" class="secondary">None</button>
        <button id="btn-toggle-user" class="toggle active" title="Check/uncheck all your messages">You</button>
        <button id="btn-toggle-copilot" class="toggle active" title="Check/uncheck all Copilot messages">Copilot</button>
      </div>
      <div id="session-list"><div class="loading">Loading&#8230;</div></div>
    </div>
    <div id="message-panel">
      <div id="message-panel-header">
        <span id="message-panel-title">Select a session</span>
        <span id="message-panel-count"></span>
      </div>
      <div id="message-list-view"></div>
    </div>
  </div>
  <div id="status-bar">Ready</div>
</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function generateNonce(): string {
  return randomBytes(16).toString('hex');
}
