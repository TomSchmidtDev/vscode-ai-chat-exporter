import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n';

export interface WorkspaceInfo {
  hash: string;
  folderUri: string;
  displayName: string;
  chatSessionFiles: string[];
}

export async function discoverAllWorkspaces(storageBase: string): Promise<WorkspaceInfo[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(storageBase, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: WorkspaceInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const hashDir = path.join(storageBase, entry.name);
    const info = await loadWorkspaceFromHashDir(hashDir);
    if (info) {
      results.push(info);
    }
  }

  return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Loads workspace info from a single hash directory.
 * Returns null if the directory has no chat session files.
 */
export async function loadWorkspaceFromHashDir(hashDir: string): Promise<WorkspaceInfo | null> {
  const chatSessionFiles = await findChatSessionFiles(hashDir);
  if (chatSessionFiles.length === 0) {
    return null;
  }

  const folderUri = await parseFolderUri(hashDir);
  const hash = path.basename(hashDir);
  const displayName = deriveName(folderUri, hash);

  return { hash, folderUri, displayName, chatSessionFiles };
}

async function parseFolderUri(hashDir: string): Promise<string> {
  const workspaceJsonPath = path.join(hashDir, 'workspace.json');
  try {
    const raw = JSON.parse(await fs.promises.readFile(workspaceJsonPath, 'utf8'));
    return raw.folder ?? raw.folders?.[0] ?? '';
  } catch {
    return '';
  }
}

async function findChatSessionFiles(hashDir: string): Promise<string[]> {
  const chatSessionsDir = path.join(hashDir, 'chatSessions');
  try {
    const entries = await fs.promises.readdir(chatSessionsDir);
    return entries
      .filter(f => f.endsWith('.json') || f.endsWith('.jsonl'))
      .map(f => path.join(chatSessionsDir, f));
  } catch {
    return [];
  }
}

/**
 * Loads sessions from globalStorage/emptyWindowChatSessions — sessions
 * created in VS Code windows opened without a workspace folder.
 * Returns null if the directory is missing or empty.
 */
export async function loadEmptyWindowSessions(emptyWindowDir: string): Promise<WorkspaceInfo | null> {
  try {
    const entries = await fs.promises.readdir(emptyWindowDir);
    const files = entries
      .filter(f => f.endsWith('.json') || f.endsWith('.jsonl'))
      .map(f => path.join(emptyWindowDir, f));

    if (files.length === 0) {
      return null;
    }

    return {
      hash: '',
      folderUri: '',
      displayName: t('noWorkspace'),
      chatSessionFiles: files,
    };
  } catch {
    return null;
  }
}

function deriveName(folderUri: string, hash: string): string {
  if (!folderUri) {
    return hash.slice(0, 8);
  }
  try {
    const decoded = decodeURIComponent(folderUri.replace('file://', ''));
    const parts = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] ?? hash.slice(0, 8);
  } catch {
    return hash.slice(0, 8);
  }
}
