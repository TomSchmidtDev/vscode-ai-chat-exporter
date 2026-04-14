import * as vscode from 'vscode';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { ExtensionToWebview, WebviewToExtension, ChatSession, ChatWorkspace } from '../types';
import { getWorkspaceStorageBase, getEmptyWindowChatSessionsDir } from '../storage/pathResolver';
import { discoverAllWorkspaces, loadWorkspaceFromHashDir, loadEmptyWindowSessions } from '../storage/workspaceDiscovery';
import { readSessionFile, normalizeSession } from '../storage/sessionReader';
import { MarkdownExporter, makeFilename } from '../exporters/markdownExporter';
import { HtmlExporter } from '../exporters/htmlExporter';
import { t, getWebviewTranslations } from '../i18n';

export class ChatExporterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'aiChatExporter.mainView';

  private _view?: vscode.WebviewView;
  private _sessions: Map<string, ChatSession> = new Map();
  private _showAllWorkspaces = false;

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
        if (typeof msg.allWorkspaces === 'boolean') {
          this._showAllWorkspaces = msg.allWorkspaces;
        }
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

  /**
   * Returns the workspaceStorage/<hash> directory for the current workspace
   * by reading it from context.storageUri (the extension's own workspace storage path).
   * This is the same hash Copilot Chat uses — no URI matching needed.
   */
  private _getCurrentHashDir(): string | undefined {
    const storageUri = this.context.storageUri;
    if (!storageUri) {
      return undefined;
    }
    // storageUri.fsPath = .../workspaceStorage/<hash>/vscode-ai-chat-exporter
    // parent              = .../workspaceStorage/<hash>
    return path.dirname(storageUri.fsPath);
  }

  private async _loadSessions(): Promise<void> {
    this._post({ type: 'loading' });
    this._sessions.clear();

    try {
      const currentHashDir = this._getCurrentHashDir();
      const hasCurrentWorkspace = !!currentHashDir && !this._showAllWorkspaces;

      let workspaceInfos;
      if (hasCurrentWorkspace) {
        // Fast path: load only the current workspace's hash directory
        const info = await loadWorkspaceFromHashDir(currentHashDir!);
        workspaceInfos = info ? [info] : [];
      } else {
        // Fallback: scan all workspace hash directories + empty-window sessions
        const storageBase = getWorkspaceStorageBase();
        workspaceInfos = await discoverAllWorkspaces(storageBase);
        const emptyWin = await loadEmptyWindowSessions(getEmptyWindowChatSessionsDir());
        if (emptyWin) {
          workspaceInfos = [...workspaceInfos, emptyWin];
        }
      }

      const chatWorkspaces: ChatWorkspace[] = [];

      for (const ws of workspaceInfos) {
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

      this._post({
        type: 'sessions',
        data: chatWorkspaces,
        allWorkspaces: !hasCurrentWorkspace,
      });
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
      vscode.window.showWarningMessage(t('noSessionsSelected'));
      return;
    }

    const outputPath = await this._pickSavePath(sessions, 'md');
    if (!outputPath) { return; }

    try {
      const exporter = new MarkdownExporter();
      const exported = await exporter.exportSessions(sessions, messageFilters, outputPath);
      if (exported.length > 0) {
        this._post({ type: 'exportDone', path: path.dirname(exported[0]), count: exported.length });
        const open = await vscode.window.showInformationMessage(
          t('exportedMd', { count: exported.length }),
          t('openFolder')
        );
        if (open === t('openFolder')) {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(exported[0])));
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(t('exportFailed', { message }));
    }
  }

  private async _exportHtml(
    sessionIds: string[],
    messageFilters: Record<string, string[]>,
    theme: string
  ): Promise<void> {
    const sessions = this._resolveSessions(sessionIds);
    if (sessions.length === 0) {
      vscode.window.showWarningMessage(t('noSessionsSelected'));
      return;
    }

    const outputPath = await this._pickSavePath(sessions, 'html');
    if (!outputPath) { return; }

    try {
      const exporter = new HtmlExporter();
      const exported = await exporter.exportSessions(sessions, messageFilters, theme, outputPath);
      if (exported.length > 0) {
        this._post({ type: 'exportDone', path: path.dirname(exported[0]), count: exported.length });
        const open = await vscode.window.showInformationMessage(
          t('exportedHtml', { count: exported.length }),
          t('openFolder')
        );
        if (open === t('openFolder')) {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(exported[0])));
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(t('exportFailed', { message }));
    }
  }

  /**
   * Shows the appropriate save dialog depending on the number of sessions:
   * - 1 session  → Save As dialog (user chooses filename + location)
   * - N sessions → Folder picker (filenames are auto-generated)
   *
   * Falls back to the configured outputDirectory setting without showing any
   * dialog if one is set.
   */
  private async _pickSavePath(sessions: ChatSession[], ext: string): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('aiChatExporter');
    const configured = config.get<string>('outputDirectory', '');
    if (configured) {
      return configured;
    }

    if (sessions.length === 1) {
      const defaultName = makeFilename(sessions[0], ext);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: ext === 'md'
          ? { 'Markdown': ['md'] }
          : { 'HTML': ['html'] },
        saveLabel: t('exportLabel'),
      });
      return uri?.fsPath;
    }

    const chosen = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t('selectFolder'),
    });
    return chosen?.[0]?.fsPath;
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
    const i18nJson = JSON.stringify(getWebviewTranslations());

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
    <button id="btn-refresh" class="secondary" title="${t('btnRefreshTitle')}">${t('btnRefresh')}</button>
    <button id="btn-export-md" title="${t('btnExportMdTitle')}">${t('btnExportMd')}</button>
    <button id="btn-export-html" title="${t('btnExportHtmlTitle')}">${t('btnExportHtml')}</button>
    <select id="theme-select" title="${t('themeSelectTitle')}">
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
    <button id="btn-settings" class="secondary" title="${t('btnSettingsTitle')}">${t('btnSettings')}</button>
  </div>
  <div id="main">
    <div id="session-panel">
      <div id="session-actions">
        <button id="btn-select-all" class="secondary">${t('btnAll')}</button>
        <button id="btn-select-none" class="secondary">${t('btnNone')}</button>
        <button id="btn-toggle-user" class="toggle active" title="${t('btnToggleUserTitle')}">${t('btnToggleUser')}</button>
        <button id="btn-toggle-copilot" class="toggle active" title="${t('btnToggleCopilotTitle')}">${t('btnToggleCopilot')}</button>
        <button id="btn-show-all" class="toggle" title="${t('btnShowAllTitle')}">${t('btnAllWs')}</button>
      </div>
      <div id="workspace-scope" class="scope-badge"></div>
      <div id="session-list"><div class="loading">${t('loadingShort')}</div></div>
    </div>
    <div id="message-panel">
      <div id="message-panel-header">
        <span id="message-panel-title">${t('selectSession')}</span>
        <span id="message-panel-count"></span>
      </div>
      <div id="message-list-view"></div>
    </div>
  </div>
  <div id="status-bar">${t('ready')}</div>
</div>
<script nonce="${nonce}">window.__i18n = ${i18nJson};</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function generateNonce(): string {
  return randomBytes(16).toString('hex');
}
