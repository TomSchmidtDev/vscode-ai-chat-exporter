import type { ChatWorkspace, ChatSession, ChatMessage, ExtensionToWebview, WebviewToExtension } from './types';
import { parseQuery, SearchMatcher, SearchNode, appendHighlighted } from './search';

// VS Code API
declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// i18n — translations injected by the extension host at startup
declare const __i18n: Record<string, string>;
function t(key: string, params?: Record<string, string | number>): string {
  let s = __i18n[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

const vscode = acquireVsCodeApi();

// ─── State ────────────────────────────────────────────────────────────────────

let allWorkspaces: ChatWorkspace[] = [];
const selectedSessions = new Set<string>();
// Per-session message selection; undefined entry = all messages selected
const selectedMessages = new Map<string, Set<string>>();
let activeSessionId: string | null = null;
// Whether "show all workspaces" mode is active
let showAllWorkspaces = false;
// Active parsed search query; null = no filtering
let activeQuery: SearchNode | null = null;
let searchDebounce: number | undefined;

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
const showAllBtn       = document.getElementById('btn-show-all')!;
const workspaceScopeEl = document.getElementById('workspace-scope');
const searchInput      = document.getElementById('search-input') as HTMLInputElement;
const searchClearBtn   = document.getElementById('search-clear')!;
const searchPromptsCb  = document.getElementById('search-prompts') as HTMLInputElement;
const searchResponsesCb = document.getElementById('search-responses') as HTMLInputElement;
const searchTitleCb    = document.getElementById('search-title') as HTMLInputElement;

// ─── Message handling ─────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ExtensionToWebview;
  switch (msg.type) {
    case 'loading':
      showStatus(t('loading'));
      sessionList.replaceChildren(makeEl('div', { className: 'loading', textContent: t('loadingShort') }));
      clearMessagePanel();
      break;
    case 'sessions':
      allWorkspaces = msg.data;
      selectedSessions.clear();
      selectedMessages.clear();
      activeSessionId = null;
      if (workspaceScopeEl) {
        workspaceScopeEl.textContent = msg.allWorkspaces ? t('scopeAll') : t('scopeCurrent');
      }
      renderSessionList();
      if (activeQuery) {
        updateSearchStatus();
        showResultSession();
      } else {
        autoSelectMostRecent();
        showStatus(t('sessionsLoaded', { count: countSessions() }));
      }
      break;
    case 'exportDone':
      showStatus(t('exportedFiles', { count: msg.count, path: msg.path }));
      break;
    case 'error':
      showStatus(t('errorPrefix', { message: msg.message }));
      sessionList.replaceChildren(makeEl('div', { className: 'error-msg', textContent: msg.message }));
      break;
    // preview type no longer used in two-panel layout
  }
});

// ─── Button handlers ──────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', () => post({ type: 'refresh', allWorkspaces: showAllWorkspaces }));

exportMdBtn.addEventListener('click', () => {
  const sessionIds = Array.from(selectedSessions);
  if (sessionIds.length === 0) { showStatus(t('selectToExport')); return; }
  post({ type: 'exportMd', sessionIds, messageFilters: buildMessageFilters(sessionIds) });
});

exportHtmlBtn.addEventListener('click', () => {
  const sessionIds = Array.from(selectedSessions);
  if (sessionIds.length === 0) { showStatus(t('selectToExport')); return; }
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

// Toggle buttons: check or uncheck message checkboxes of the active session's role
toggleUserBtn.addEventListener('click', () => {
  const nowActive = !toggleUserBtn.classList.contains('active');
  toggleUserBtn.classList.toggle('active', nowActive);
  applyRoleToggle('user', nowActive);
});

toggleCopilotBtn.addEventListener('click', () => {
  const nowActive = !toggleCopilotBtn.classList.contains('active');
  toggleCopilotBtn.classList.toggle('active', nowActive);
  applyRoleToggle('assistant', nowActive);
});

// Toggle between current workspace and all workspaces
showAllBtn.addEventListener('click', () => {
  showAllWorkspaces = !showAllWorkspaces;
  showAllBtn.classList.toggle('active', showAllWorkspaces);
  post({ type: 'refresh', allWorkspaces: showAllWorkspaces });
});

// ─── Search handlers ──────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  window.clearTimeout(searchDebounce);
  searchDebounce = window.setTimeout(applySearch, 300);
});

searchClearBtn.addEventListener('click', () => {
  window.clearTimeout(searchDebounce);
  searchInput.value = '';
  applySearch();
  searchInput.focus();
});

for (const cb of [searchPromptsCb, searchResponsesCb, searchTitleCb]) {
  cb.addEventListener('change', applySearch);
}

// ─── Search ───────────────────────────────────────────────────────────────────

function applySearch(): void {
  const raw = searchInput.value.trim();
  searchClearBtn.classList.toggle('hidden', raw.length === 0);

  if (raw.length === 0) {
    activeQuery = null;
    setSearchError(null);
  } else {
    try {
      activeQuery = parseQuery(raw);
      setSearchError(null);
    } catch (e) {
      // Invalid query: show error on the field, render unfiltered (IntelliJ behavior)
      activeQuery = null;
      setSearchError(e instanceof Error ? e.message : String(e));
    }
  }

  renderSessionList();
  updateSearchStatus();
  showResultSession();
}

function setSearchError(message: string | null): void {
  searchInput.classList.toggle('invalid', message !== null);
  searchInput.title = message ?? '';
}

function currentMatcher(): SearchMatcher | null {
  return activeQuery ? new SearchMatcher(activeQuery) : null;
}

/**
 * Number of hits in a session: title (if Title scope on) counts 1,
 * plus each message whose text matches within the Prompts/Responses scope.
 */
function sessionMatchCount(session: ChatSession, matcher: SearchMatcher): number {
  let count = 0;
  if (searchTitleCb.checked && matcher.matches(session.title)) count++;
  for (const msg of session.messages) {
    const inScope = msg.role === 'user' ? searchPromptsCb.checked : searchResponsesCb.checked;
    if (inScope && matcher.matches(msg.text)) count++;
  }
  return count;
}

function updateSearchStatus(): void {
  const matcher = currentMatcher();
  const total = countSessions();
  if (!matcher) {
    showStatus(t('sessionsLoaded', { count: total }));
    return;
  }
  let matched = 0;
  for (const ws of allWorkspaces) {
    for (const s of ws.sessions) {
      if (sessionMatchCount(s, matcher) > 0) matched++;
    }
  }
  showStatus(t('searchMatchStatus', { matched, total }));
}

/**
 * After a search change: activate the first matching session (display order);
 * without matches/query keep the previously active session. Re-renders the
 * message panel either way so highlights and dimming stay in sync.
 */
function showResultSession(): void {
  const matcher = currentMatcher();
  let target: ChatSession | undefined;

  if (matcher) {
    outer:
    for (const ws of sortedWorkspaces()) {
      for (const s of ws.sessions) {
        if (sessionMatchCount(s, matcher) > 0) { target = s; break outer; }
      }
    }
  }
  if (!target && activeSessionId) target = findSession(activeSessionId);

  if (!target) { clearMessagePanel(); return; }

  if (target.id === activeSessionId) {
    // Same session: re-render only the message panel so role-toggle state survives
    renderMessagePanel(target);
    return;
  }

  const safeId = target.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = sessionList.querySelector<HTMLElement>(`[data-session-id="${safeId}"]`);
  if (el) activateSession(target, el);
}

// ─── Session rendering ────────────────────────────────────────────────────────

function renderSessionList(): void {
  sessionList.replaceChildren();

  if (allWorkspaces.length === 0) {
    sessionList.appendChild(makeEl('div', { className: 'empty-msg', textContent: t('noSessions') }));
    return;
  }

  const matcher = currentMatcher();
  for (const ws of sortedWorkspaces()) {
    const wsEl = makeEl('div', { className: 'workspace-group' });
    wsEl.appendChild(makeEl('div', { className: 'workspace-label', textContent: ws.displayName }));
    for (const session of ws.sessions) {
      wsEl.appendChild(buildSessionItem(session, matcher));
    }
    sessionList.appendChild(wsEl);
  }
}

function sortedWorkspaces(): ChatWorkspace[] {
  return [...allWorkspaces].sort(
    (a, b) => (b.sessions[0]?.lastMessageAt ?? 0) - (a.sessions[0]?.lastMessageAt ?? 0)
  );
}

function buildSessionItem(session: ChatSession, matcher: SearchMatcher | null): HTMLElement {
  const el = makeEl('div', { className: 'session-item' });
  el.dataset['sessionId'] = session.id;
  // Re-renders must preserve activation state (search re-renders the list)
  if (session.id === activeSessionId) el.classList.add('active');

  const matchCount = matcher ? sessionMatchCount(session, matcher) : -1;
  if (matcher && matchCount === 0) el.classList.add('dimmed');

  // Checkbox + title row
  const row = makeEl('div', { className: 'session-label' });
  row.title = session.title;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'session-checkbox';
  // Re-renders must preserve export selection (search never changes it)
  checkbox.checked = selectedSessions.has(session.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedSessions.add(session.id);
    else selectedSessions.delete(session.id);
  });

  row.appendChild(checkbox);
  if (matcher && matchCount > 0) {
    row.appendChild(makeEl('span', { className: 'match-badge', textContent: `[${matchCount}]` }));
  }
  row.appendChild(makeEl('span', { className: 'session-title', textContent: truncate(session.title, 52) }));
  el.appendChild(row);

  // Meta row
  const metaRow = makeEl('div', { className: 'session-meta-row' });
  metaRow.appendChild(makeEl('span', { className: 'session-date', textContent: new Date(session.createdAt).toLocaleDateString() }));
  const msgCount = session.messages.length;
  metaRow.appendChild(makeEl('span', { className: 'session-count', textContent: `${msgCount} ${msgCount !== 1 ? t('msgsSuffix') : t('msgSuffix')}` }));
  metaRow.appendChild(makeEl('span', { className: 'session-mode tag', textContent: session.mode }));
  el.appendChild(metaRow);

  // Click on item (not directly on checkbox) → show messages in right panel
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement) === checkbox) return;
    activateSession(session, el);
  });

  return el;
}

function activateSession(session: ChatSession, el: HTMLElement): void {
  if (activeSessionId === session.id) return;
  activeSessionId = session.id;

  document.querySelectorAll('.session-item.active').forEach(s => s.classList.remove('active'));
  el.classList.add('active');

  // Reset role toggle buttons to "all active" for the new session
  toggleUserBtn.classList.add('active');
  toggleCopilotBtn.classList.add('active');

  renderMessagePanel(session);
}

function autoSelectMostRecent(): void {
  // Find the globally most recent session
  let best: { session: ChatSession; el: HTMLElement | null } | null = null;

  for (const ws of allWorkspaces) {
    for (const s of ws.sessions) {
      if (!best || s.lastMessageAt > best.session.lastMessageAt) {
        const safeId = s.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const el = sessionList.querySelector<HTMLElement>(`[data-session-id="${safeId}"]`);
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

  // Initialize message selection with all messages checked
  if (!selectedMessages.has(session.id)) {
    selectedMessages.set(session.id, new Set(session.messages.map(m => m.id)));
  }

  const msgSet = selectedMessages.get(session.id)!;
  const matcher = currentMatcher();
  messageListView.replaceChildren();

  let firstMatchEl: HTMLElement | null = null;
  for (const msg of session.messages) {
    const item = buildMessageItem(msg, msgSet, matcher);
    if (matcher && !firstMatchEl && !item.classList.contains('dimmed')) firstMatchEl = item;
    messageListView.appendChild(item);
  }

  updateMessageCount(session);
  firstMatchEl?.scrollIntoView({ block: 'nearest' });
}

function buildMessageItem(msg: ChatMessage, msgSet: Set<string>, matcher: SearchMatcher | null): HTMLElement {
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
  label.appendChild(makeEl('span', { className: 'msg-role', textContent: msg.role === 'user' ? t('roleYou') : t('roleCopilot') }));

  const flat = msg.text.replace(/\n/g, ' ');
  const preview = truncate(flat, 80);
  const previewSpan = makeEl('span', { className: 'msg-preview' });

  if (matcher) {
    const inScope = msg.role === 'user' ? searchPromptsCb.checked : searchResponsesCb.checked;
    if (inScope && matcher.matches(flat)) {
      // Match decided on full text; highlight ranges computed on the visible preview
      appendHighlighted(previewSpan, preview, matcher.matchRanges(preview));
    } else {
      previewSpan.textContent = preview;
      label.classList.add('dimmed');
    }
  } else {
    previewSpan.textContent = preview;
  }

  label.appendChild(previewSpan);
  return label;
}

function clearMessagePanel(): void {
  messagePanelTitle.textContent = t('selectSession');
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
 * Checks or unchecks message checkboxes of the given role for the active session only.
 */
function applyRoleToggle(role: 'user' | 'assistant', checked: boolean): void {
  if (!activeSessionId) return;
  const session = findSession(activeSessionId);
  if (!session) return;

  if (!selectedMessages.has(session.id)) {
    selectedMessages.set(session.id, new Set(session.messages.map(m => m.id)));
  }
  const msgSet = selectedMessages.get(session.id)!;
  for (const msg of session.messages) {
    if (msg.role === role) {
      if (checked) msgSet.add(msg.id); else msgSet.delete(msg.id);
    }
  }

  // Update visible checkboxes in the message panel
  document.querySelectorAll<HTMLInputElement>(`.msg-checkbox[data-role="${role}"]`).forEach(cb => {
    cb.checked = checked;
  });

  updateMessageCount(session);
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function buildMessageFilters(sessionIds: string[]): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const ws of allWorkspaces) {
    for (const session of ws.sessions) {
      if (!sessionIds.includes(session.id)) { continue; }
      const msgSet = selectedMessages.get(session.id);
      // If session was never shown, default to all messages
      if (!msgSet) {
        filters[session.id] = session.messages.map(m => m.id);
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
