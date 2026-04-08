// ─── Raw JSON shapes from VS Code storage ────────────────────────────────────

export interface RawChatSession {
  version?: number;
  sessionId: string;
  creationDate: number;
  lastMessageDate?: number;
  customTitle?: string;
  responderUsername?: string;
  initialLocation?: string;
  mode?: { id: string; kind: string };
  requests: RawChatRequest[];
  selectedModel?: { identifier: string; metadata?: { name?: string } };
  // v3 .jsonl format: selectedModel lives inside inputState
  inputState?: { selectedModel?: { identifier: string; metadata?: { name?: string } } };
  hasPendingEdits?: boolean;
}

export interface RawChatRequest {
  requestId: string;
  message: { text: string; parts?: unknown[] };
  response: RawResponsePart[];
  agent?: { id: string; name: string };
  timestamp?: number;
  modelId?: string;
  slashCommand?: { name: string; description?: string };
  contentReferences?: unknown[];
  codeCitations?: unknown[];
}

export type RawResponsePart =
  | { value: string; supportThemeIcons?: boolean; baseUri?: object }
  | { kind: 'inlineReference'; inlineReference: { name: string; location?: { uri?: { fsPath?: string } } } }
  | { kind: 'codeblockUri'; uri: { fsPath?: string; path?: string } }
  | { kind: string; [key: string]: unknown };

// ─── Normalized domain model ──────────────────────────────────────────────────

export interface ChatWorkspace {
  hash: string;
  folderUri: string;
  displayName: string;
  sessions: ChatSession[];
}

export interface ChatSession {
  id: string;
  workspaceHash: string;
  workspaceDisplayName: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  mode: string;
  modelName: string;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp?: number;
  agentName?: string;
  slashCommand?: string;
}

// ─── Webview message protocol ─────────────────────────────────────────────────

export type ExtensionToWebview =
  | { type: 'sessions'; data: ChatWorkspace[] }
  | { type: 'preview'; html: string }
  | { type: 'exportDone'; path: string; count: number }
  | { type: 'error'; message: string }
  | { type: 'loading' };

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'preview'; sessionId: string }
  | { type: 'exportMd'; sessionIds: string[]; messageFilters: Record<string, string[]> }
  | { type: 'exportHtml'; sessionIds: string[]; messageFilters: Record<string, string[]>; theme: string }
  | { type: 'openSettings' };

// ─── Themes ───────────────────────────────────────────────────────────────────

export interface ThemeColors {
  background: string;
  surface: string;
  userBubble: string;
  assistantBubble: string;
  userText: string;
  assistantText: string;
  accent: string;
  border: string;
  codeBackground: string;
  codeText: string;
  timestamp: string;
  headerBackground: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
}
