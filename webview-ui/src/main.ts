import './style.css';
import type { ChatWorkspace, ChatSession, ChatMessage, ExtensionToWebview, WebviewToExtension } from './types';

// VS Code API
declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ─── State ────────────────────────────────────────────────────────────────────

let allWorkspaces: ChatWorkspace[] = [];
const selectedSessions = new Set<string>();
const selectedMessages = new Map<string, Set<string>>();
let activePreviewId: string | null = null;
let showUser = true;
let showAssistant = true;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const sessionList = document.getElementById('session-list')!;
const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
const previewPlaceholder = document.getElementById('preview-placeholder')!;
const exportMdBtn = document.getElementById('btn-export-md')!;
const exportHtmlBtn = document.getElementById('btn-export-html')!;
const refreshBtn = document.getElementById('btn-refresh')!;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const statusBar = document.getElementById('status-bar')!;
const selectAllBtn = document.getElementById('btn-select-all')!;
const selectNoneBtn = document.getElementById('btn-select-none')!;
const toggleUserBtn = document.getElementById('btn-toggle-user')!;
const toggleCopilotBtn = document.getElementById('btn-toggle-copilot')!;

// ─── Message handling ─────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ExtensionToWebview;
  switch (msg.type) {
    case 'loading':
      showStatus('Loading sessions…');
      sessionList.replaceChildren(makeEl('div', { className: 'loading', textContent: 'Loading…' }));
      break;
    case 'sessions':
      allWorkspaces = msg.data;
      selectedSessions.clear();
      selectedMessages.clear();
      renderSessionList();
      showStatus(`${countSessions()} session(s) loaded`);
      break;
    case 'preview':
      showPreview(msg.html);
      break;
    case 'exportDone':
      showStatus(`✓ Exported ${msg.count} file(s) to ${msg.path}`);
      break;
    case 'error':
      showStatus(`⚠ ${msg.message}`);
      sessionList.replaceChildren(makeEl('div', { className: 'error-msg', textContent: msg.message }));
      break;
  }
});

// ─── Button handlers ──────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', () => post({ type: 'refresh' }));

exportMdBtn.addEventListener('click', () => {
  const sessionIds = Array.from(selectedSessions);
  if (sessionIds.length === 0) { showStatus('Select at least one session to export.'); return; }
  post({ type: 'exportMd', sessionIds, messageFilters: buildMessageFilters(sessionIds) });
});

exportHtmlBtn.addEventListener('click', () => {
  const sessionIds = Array.from(selectedSessions);
  if (sessionIds.length === 0) { showStatus('Select at least one session to export.'); return; }
  post({ type: 'exportHtml', sessionIds, messageFilters: buildMessageFilters(sessionIds), theme: themeSelect.value });
});

selectAllBtn.addEventListener('click', () => {
  for (const ws of allWorkspaces) for (const s of ws.sessions) selectedSessions.add(s.id);
  document.querySelectorAll<HTMLInputElement>('.session-checkbox').forEach(cb => { cb.checked = true; });
});

selectNoneBtn.addEventListener('click', () => {
  selectedSessions.clear();
  document.querySelectorAll<HTMLInputElement>('.session-checkbox').forEach(cb => { cb.checked = false; });
});

document.getElementById('btn-settings')?.addEventListener('click', () => post({ type: 'openSettings' }));

toggleUserBtn.addEventListener('click', () => {
  showUser = !showUser;
  toggleUserBtn.classList.toggle('active', showUser);
  applyRoleFilter();
});

toggleCopilotBtn.addEventListener('click', () => {
  showAssistant = !showAssistant;
  toggleCopilotBtn.classList.toggle('active', showAssistant);
  applyRoleFilter();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderSessionList(): void {
  sessionList.replaceChildren();

  if (allWorkspaces.length === 0) {
    sessionList.appendChild(makeEl('div', { className: 'empty-msg', textContent: 'No Copilot Chat sessions found.' }));
    return;
  }

  for (const ws of allWorkspaces) {
    const wsEl = makeEl('div', { className: 'workspace-group' });
    wsEl.appendChild(makeEl('div', { className: 'workspace-label', textContent: ws.displayName }));
    for (const session of ws.sessions) wsEl.appendChild(buildSessionItem(session));
    sessionList.appendChild(wsEl);
  }
}

function buildSessionItem(session: ChatSession): HTMLElement {
  const el = makeEl('div', { className: 'session-item' });

  // Label row with checkbox
  const label = makeEl('label', { className: 'session-label' });
  label.title = session.title;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'session-checkbox';
  label.appendChild(checkbox);
  label.appendChild(makeEl('span', { className: 'session-title', textContent: truncate(session.title, 55) }));
  el.appendChild(label);

  // Meta row
  const metaRow = makeEl('div', { className: 'session-meta-row' });
  metaRow.appendChild(makeEl('span', { className: 'session-date', textContent: new Date(session.createdAt).toLocaleDateString() }));
  const msgCount = session.messages.length;
  metaRow.appendChild(makeEl('span', { className: 'session-count', textContent: `${msgCount} msg${msgCount !== 1 ? 's' : ''}` }));
  metaRow.appendChild(makeEl('span', { className: 'session-mode tag', textContent: session.mode }));
  el.appendChild(metaRow);

  // Expandable message list
  const messageListEl = makeEl('div', { className: 'message-list hidden' });
  el.appendChild(messageListEl);

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedSessions.add(session.id);
    else selectedSessions.delete(session.id);
  });

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;

    if (activePreviewId !== session.id) {
      activePreviewId = session.id;
      document.querySelectorAll('.session-item.active').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      post({ type: 'preview', sessionId: session.id });
    }

    const hidden = messageListEl.classList.toggle('hidden');
    if (!hidden && messageListEl.childElementCount === 0) renderMessageList(session, messageListEl);
  });

  return el;
}

function renderMessageList(session: ChatSession, container: HTMLElement): void {
  if (!selectedMessages.has(session.id)) {
    selectedMessages.set(session.id, new Set(session.messages.map(m => m.id)));
  }
  const msgSet = selectedMessages.get(session.id)!;

  for (const msg of session.messages) {
    const label = makeEl('label', { className: `message-item message-${msg.role}` });
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'msg-checkbox';
    cb.checked = msgSet.has(msg.id);
    cb.addEventListener('change', () => {
      if (cb.checked) msgSet.add(msg.id); else msgSet.delete(msg.id);
    });
    label.appendChild(cb);
    label.appendChild(makeEl('span', { className: 'msg-role', textContent: msg.role === 'user' ? 'You' : 'Copilot' }));
    label.appendChild(makeEl('span', { className: 'msg-preview', textContent: truncate(msg.text.replace(/\n/g, ' '), 60) }));
    container.appendChild(label);
  }
}

function showPreview(html: string): void {
  // html is generated by HtmlExporter from local JSON files – not user-controlled network content
  previewPlaceholder.style.display = 'none';
  previewFrame.style.display = 'block';
  const doc = previewFrame.contentDocument;
  if (doc) { doc.open(); doc.write(html); doc.close(); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(msg: WebviewToExtension): void { vscode.postMessage(msg); }

function showStatus(msg: string): void { statusBar.textContent = msg; }

function countSessions(): number {
  return allWorkspaces.reduce((sum, ws) => sum + ws.sessions.length, 0);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function buildMessageFilters(sessionIds: string[]): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const ws of allWorkspaces) {
    for (const session of ws.sessions) {
      if (!sessionIds.includes(session.id)) { continue; }
      // Start with explicitly selected messages (or all if not expanded yet)
      const base = selectedMessages.has(session.id)
        ? Array.from(selectedMessages.get(session.id)!)
        : session.messages.map(m => m.id);
      // Apply role toggle filter
      const allowed = base.filter(msgId => {
        const msg = session.messages.find(m => m.id === msgId);
        if (!msg) { return false; }
        if (msg.role === 'user' && !showUser) { return false; }
        if (msg.role === 'assistant' && !showAssistant) { return false; }
        return true;
      });
      filters[session.id] = allowed;
    }
  }
  return filters;
}

function applyRoleFilter(): void {
  document.querySelectorAll<HTMLElement>('.message-item').forEach(el => {
    const isUser = el.classList.contains('message-user');
    const isAssistant = el.classList.contains('message-assistant');
    if (isUser) { el.classList.toggle('role-hidden', !showUser); }
    if (isAssistant) { el.classList.toggle('role-hidden', !showAssistant); }
  });
}

function makeEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Pick<HTMLElementTagNameMap[K], 'className' | 'textContent' | 'title'>> = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className !== undefined) el.className = props.className;
  if (props.textContent !== undefined) el.textContent = props.textContent;
  if (props.title !== undefined) el.title = props.title;
  return el;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

post({ type: 'ready' });
