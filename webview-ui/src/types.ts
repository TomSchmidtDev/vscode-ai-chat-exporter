// Shared types for the webview frontend (mirrors src/types.ts but for browser context)

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
