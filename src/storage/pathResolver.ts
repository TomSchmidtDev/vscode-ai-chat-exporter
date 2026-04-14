import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export function getVSCodeStorageBase(): string {
  const override = vscode.workspace.getConfiguration('aiChatExporter').get<string>('storageBasePath');
  if (override) {
    return override;
  }

  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
    case 'win32':
      return path.join(process.env.APPDATA ?? os.homedir(), 'Code', 'User');
    case 'linux':
      return path.join(os.homedir(), '.config', 'Code', 'User');
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export function getWorkspaceStorageBase(): string {
  return path.join(getVSCodeStorageBase(), 'workspaceStorage');
}

export function getEmptyWindowChatSessionsDir(): string {
  return path.join(getVSCodeStorageBase(), 'globalStorage', 'emptyWindowChatSessions');
}

export function getInsidersStorageBase(): string | null {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
    case 'win32':
      return path.join(process.env.APPDATA ?? os.homedir(), 'Code - Insiders', 'User');
    case 'linux':
      return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
    default:
      return null;
  }
}
