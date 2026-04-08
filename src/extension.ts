import * as vscode from 'vscode';
import { ChatExporterViewProvider } from './webview/panelProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatExporterViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatExporterViewProvider.viewId,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiChatExporter.open', () => {
      vscode.commands.executeCommand('workbench.view.extension.ai-chat-exporter');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiChatExporter.refresh', () => {
      provider.refresh();
    })
  );
}

export function deactivate(): void {}
