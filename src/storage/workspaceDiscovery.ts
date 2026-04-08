import * as fs from 'fs';
import * as path from 'path';

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
    const folderUri = await parseFolderUri(hashDir);
    const chatSessionFiles = await findChatSessionFiles(hashDir);

    if (chatSessionFiles.length === 0) {
      continue;
    }

    const displayName = deriveName(folderUri, entry.name);

    results.push({
      hash: entry.name,
      folderUri,
      displayName,
      chatSessionFiles,
    });
  }

  return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(chatSessionsDir, f));
  } catch {
    return [];
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
