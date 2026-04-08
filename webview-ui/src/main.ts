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
// Per-session message selection; undefined entry = all messages selected
const selectedMessages = new Map<string, Set<string>>();
let activeSessionId: string | null = null;
// Toggle state: tracks whether You/Copilot messages are globally included
let showUser = true;
let showAssistant = true;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const sessionList      = document.getElementById('session-list')!;
const messageListView  = document.getElementById('message-list-view')!;
const messagePanelTitle = document.getElementById('message-panel-title')!;
const messagePanelCount = document.getElementById('message-panel-count')!;
const exportMdBtn      = document.getElementById('btn-export-md')!;
const exportHtmlBtn    = document.getElementById('btn-export-html')!;
const refreshBtn       = document.getElementById('btn-refresh')!;
const themeSelect      = document.getElementById('theme-select') as HTMLSelectElement;
const statusBar        = document.getElementById('status-bar')!;
const selectAllBtn     = document.getElementById('btn-select-all')!;
const selectNoneBtn    = document.getElementById('btn-select-none')!;
const toggleUserBtn    = document.getElementById('btn-toggle-user')!;
const toggleCopilotBtn = document.getElementById('btn-toggle-copilot')!;

// ─── Message handling ─────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ExtensionToWebview;
  switch (msg.type) {
    case 'loading':
      showStatus('Loading sessions…');
      sessionList.replaceChildren(makeEl('div', { className: 'loading', textContent: 'Loading…' }));
      clearMessagePanel();
      break;
    case 'sessions':
      allWorkspaces = msg.data;
      selectedSessions.clear();
      selectedMessages.clear();
      activeSessionId = null;
      renderSessionList();
      autoSelectMostRecent();
      showStatus(`${countSessions()} session(s) loaded`);
      break;
    case 'exportDone':
      showStatus(`✓ Exported ${msg.count} file(s) to ${msg.path}`);
      break;
    case 'error':
      showStatus(`⚠ ${msg.message}`);
      sessionList.replaceChildren(makeEl('div', { className: 'error-msg', textContent: msg.message }));
      break;
    // preview type no longer used in two-panel layout
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
  for (const ws of allWorkspaces) {
    for (const s of ws.sessions) selectedSessions.add(s.id);
  }
  document.querySelectorAll<HTMLInputElement>('.session-checkbox').forEach(cb => { cb.checked = true; });
});

selectNoneBtn.addEventListener('click', () => {
  selectedSessions.clear();
  document.querySelectorAll<HTMLInputElement>('.session-checkbox').forEach(cb => { cb.checked = false; });
});

document.getElementById('btn-settings')?.addEventListener('click', () => post({ type: 'openSettings' }));

// Toggle buttons: check or uncheck ALL message checkboxes of that role across all sessions
toggleUserBtn.addEventListener('click', () => {
  showUser = !showUser;
  toggleUserBtn.classList.toggle('active', showUser);
  applyRoleToggle('user', showUser);
});

toggleCopilotBtn.addEventListener('click', () => {
  showAssistant = !showAssistant;
  toggleCopilotBtn.classList.toggle('active', showAssistant);
  applyRoleToggle('assistant', showAssistant);
});

// ─── Session rendering ────────────────────────────────────────────────────────

function renderSessionList(): void {
  sessionList.replaceChildren();

  if (allWorkspaces.length === 0) {
    sessionList.appendChild(makeEl('div', { className: 'empty-msg', textContent: 'No Copilot Chat sessions found.' }));
    return;
  }

  for (const ws of allWorkspaces) {
    const wsEl = makeEl('div', { className: 'workspace-group' });
    wsEl.appendChild(makeEl('div', { className: 'workspace-label', textContent: ws.displayName }));
    for (const session of ws.sessions) {
      wsEl.appendChild(buildSessionItem(session));
    }
    sessionList.appendChild(wsEl);
  }
}

function buildSessionItem(session: ChatSession): HTMLElement {
  const el = makeEl('div', { className: 'session-item' });
  el.dataset['sessionId'] = session.id;

  // Checkbox + title row
  const label = makeEl('label', { className: 'session-label' });
  label.title = session.title;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'session-checkbox';
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    if (checkbox.checked) selectedSessions.add(session.id);
    else selectedSessions.delete(session.id);
  });

  label.appendChild(checkbox);
  label.appendChild(makeEl('span', { className: 'session-title', textContent: truncate(session.title, 52) }));
  el.appendChild(label);

  // Meta row
  const metaRow = makeEl('div', { className: 'session-meta-row' });
  metaRow.appendChild(makeEl('span', { className: 'session-date', textContent: new Date(session.createdAt).toLocaleDateString() }));
  const msgCount = session.messages.length;
  metaRow.appendChild(makeEl('span', { className: 'session-count', textContent: `${msgCount} msg${msgCount !== 1 ? 's' : ''}` }));
  metaRow.appendChild(makeEl('span', { className: 'session-mode tag', textContent: session.mode }));
  el.appendChild(metaRow);

  // Click on item (not checkbox) → show messages in right panel
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
    activateSession(session, el);
  });

  return el;
}

function activateSession(session: ChatSession, el: HTMLElement): void {
  if (activeSessionId === session.id) return;
  activeSessionId = session.id;

  document.querySelectorAll('.session-item.active').forEach(s => s.classList.remove('active'));
  el.classList.add('active');

  renderMessagePanel(session);
}

function autoSelectMostRecent(): void {
  // Find the globally most recent session
  let best: { session: ChatSession; el: HTMLElement | null } | null = null;

  for (const ws of allWorkspaces) {
    for (const s of ws.sessions) {
      if (!best || s.lastMessageAt > best.session.lastMessageAt) {
        const el = sessionList.querySelector<HTMLElement>(`[data-session-id="${s.id}"]`);
        best = { session: s, el };
      }
    }
  }

  if (!best) return;

  // Check its checkbox
  const checkbox = best.el?.querySelector<HTMLInputElement>('.session-checkbox');
  if (checkbox) { checkbox.checked = true; selectedSessions.add(best.session.id); }

  // Activate (show messages on right)
  if (best.el) activateSession(best.session, best.el);
}

// ─── Message panel ────────────────────────────────────────────────────────────

function renderMessagePanel(session: ChatSession): void {
  messagePanelTitle.textContent = session.title;

  // Initialize message selection if not yet done
  if (!selectedMessages.has(session.id)) {
    const all = new Set(session.messages.map(m => m.id));
    // Respect current role toggles
    if (!showUser || !showAssistant) {
      for (const m of session.messages) {
        if (m.role === 'user' && !showUser) all.delete(m.id);
        if (m.role === 'assistant' && !showAssistant) all.delete(m.id);
      }
    }
    selectedMessages.set(session.id, all);
  }

  const msgSet = selectedMessages.get(session.id)!;
  messageListView.replaceChildren();

  for (const msg of session.messages) {
    messageListView.appendChild(buildMessageItem(msg, msgSet));
  }

  updateMessageCount(session);
}

function buildMessageItem(msg: ChatMessage, msgSet: Set<string>): HTMLElement {
  const label = makeEl('label', { className: `message-item message-${msg.role}` });

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'msg-checkbox';
  cb.dataset['msgId'] = msg.id;
  cb.dataset['role'] = msg.role;
  cb.checked = msgSet.has(msg.id);

  cb.addEventListener('change', () => {
    if (cb.checked) msgSet.add(msg.id); else msgSet.delete(msg.id);
    if (activeSessionId) {
      const session = findSession(activeSessionId);
      if (session) updateMessageCount(session);
    }
  });

  label.appendChild(cb);
  label.appendChild(makeEl('span', { className: 'msg-role', textContent: msg.role === 'user' ? 'You' : 'Copilot' }));
  label.appendChild(makeEl('span', { className: 'msg-preview', textContent: truncate(msg.text.replace(/\n/g, ' '), 80) }));

  return label;
}

function clearMessagePanel(): void {
  messagePanelTitle.textContent = 'Select a session';
  messagePanelCount.textContent = '';
  messageListView.replaceChildren();
}

function updateMessageCount(session: ChatSession): void {
  const total = session.messages.length;
  const checked = selectedMessages.get(session.id)?.size ?? total;
  messagePanelCount.textContent = `${checked}/${total}`;
}

// ─── Role toggle ──────────────────────────────────────────────────────────────

/**
 * Checks or unchecks ALL message checkboxes of the given role across all sessions.
 * Updates both the selectedMessages state and visible checkboxes in the message panel.
 */
function applyRoleToggle(role: 'user' | 'assistant', checked: boolean): void {
  // Update state for all sessions (including those not yet displayed)
  for (const ws of allWorkspaces) {
    for (const session of ws.sessions) {
      if (!selectedMessages.has(session.id)) {
        selectedMessages.set(session.id, new Set(session.messages.map(m => m.id)));
      }
      const msgSet = selectedMessages.get(session.id)!;
      for (const msg of session.messages) {
        if (msg.role === role) {
          if (checked) msgSet.add(msg.id); else msgSet.delete(msg.id);
        }
      }
    }
  }

  // Update visible checkboxes in the message panel
  document.querySelectorAll<HTMLInputElement>(`.msg-checkbox[data-role="${role}"]`).forEach(cb => {
    cb.checked = checked;
  });

  // Refresh count display
  if (activeSessionId) {
    const session = findSession(activeSessionId);
    if (session) updateMessageCount(session);
  }
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function buildMessageFilters(sessionIds: string[]): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const ws of allWorkspaces) {
    for (const session of ws.sessions) {
      if (!sessionIds.includes(session.id)) { continue; }
      const msgSet = selectedMessages.get(session.id);
      // If session was never shown, default to all messages respecting role toggles
      if (!msgSet) {
        filters[session.id] = session.messages
          .filter(m => (m.role === 'user' ? showUser : showAssistant))
          .map(m => m.id);
      } else {
        filters[session.id] = Array.from(msgSet);
      }
    }
  }
  return filters;
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

function findSession(id: string): ChatSession | undefined {
  for (const ws of allWorkspaces) {
    const s = ws.sessions.find(s => s.id === id);
    if (s) return s;
  }
  return undefined;
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
