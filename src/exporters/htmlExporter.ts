import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import { ChatSession, ChatMessage, Theme, ThemeColors } from '../types';
import { THEMES } from '../themes/themes';
import { makeFilename } from './markdownExporter';

// Import highlight.js CSS as text (inlined by esbuild loader:.css=text)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hljsDarkCss: string = require('highlight.js/styles/github-dark.css');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hljsLightCss: string = require('highlight.js/styles/github.css');

function configureMarked(): void {
  const renderer = new Renderer();
  // marked v11 passes (code, infostring, escaped) to the code renderer
  renderer.code = (code: string, lang: string | undefined) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(code, { language }).value;
    const langClass = lang ? ` language-${esc(lang)}` : '';
    return `<pre><code class="hljs${langClass}">${highlighted}</code></pre>`;
  };
  // Escape raw HTML tokens so prompt-injected markup cannot execute in exports
  renderer.html = (html: string) => esc(html);
  marked.use({ renderer });
}

configureMarked();

export class HtmlExporter {
  /**
   * @param outputPath  Either a concrete file path (single-session Save As)
   *                    or a directory path (multi-session folder export).
   */
  async exportSessions(
    sessions: ChatSession[],
    messageFilters: Record<string, string[]>,
    themeName: string,
    outputPath: string
  ): Promise<string[]> {
    const theme = resolveTheme(themeName);
    const exported: string[] = [];

    for (const session of sessions) {
      const msgs = messageFilters[session.id]
        ? session.messages.filter(m => messageFilters[session.id].includes(m.id))
        : session.messages;

      const html = buildPage([{ session, messages: msgs }], theme);
      // If outputPath already has a .html extension it IS the target file;
      // otherwise treat it as a directory and generate a filename.
      const filePath = path.extname(outputPath).toLowerCase() === '.html'
        ? outputPath
        : path.join(outputPath, makeFilename(session, 'html'));
      await fs.promises.writeFile(filePath, html, 'utf8');
      exported.push(filePath);
    }

    return exported;
  }

  renderPreview(session: ChatSession): string {
    const theme = resolveTheme('github-dark');
    return buildPreviewFragment(session, session.messages, theme);
  }
}

function resolveTheme(themeName: string): Theme {
  const base = THEMES[themeName] ?? THEMES['github-dark'];
  const config = vscode.workspace.getConfiguration('aiChatExporter');
  const customColors = config.get<Partial<ThemeColors>>('customColors', {});

  if (Object.keys(customColors).length === 0 || themeName !== 'custom') {
    return base;
  }
  // Validate each color value before interpolating into CSS
  const validatedColors: Partial<ThemeColors> = {};
  for (const [key, value] of Object.entries(customColors)) {
    if (key in base.colors) {
      (validatedColors as Record<string, string>)[key] = safeColor(value, base.colors[key as keyof ThemeColors]);
    }
  }
  return { ...base, colors: { ...base.colors, ...validatedColors } };
}

interface SessionSlice {
  session: ChatSession;
  messages: ChatMessage[];
}

function buildPage(slices: SessionSlice[], theme: Theme): string {
  const isLight = theme.id === 'light-classic';
  const hljsCss = isLight ? hljsLightCss : hljsDarkCss;
  const c = theme.colors;

  const body = slices.map(s => renderSessionHtml(s.session, s.messages)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Copilot Chat Export</title>
<style>
${hljsCss}
:root {
  --bg: ${c.background};
  --surface: ${c.surface};
  --user-bubble: ${c.userBubble};
  --assistant-bubble: ${c.assistantBubble};
  --user-text: ${c.userText};
  --assistant-text: ${c.assistantText};
  --accent: ${c.accent};
  --border: ${c.border};
  --code-bg: ${c.codeBackground};
  --code-text: ${c.codeText};
  --timestamp: ${c.timestamp};
  --header-bg: ${c.headerBackground};
}
*, *::before, *::after { box-sizing: border-box; }
body {
  background: var(--bg);
  color: var(--assistant-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  margin: 0;
  padding: 24px;
  line-height: 1.6;
  font-size: 15px;
}
.container { max-width: 960px; margin: 0 auto; }
.session {
  margin-bottom: 48px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.session-header {
  background: var(--header-bg);
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
}
.session-header h2 {
  margin: 0 0 6px;
  color: var(--accent);
  font-size: 1.15em;
  font-weight: 600;
}
.session-meta {
  font-size: 0.82em;
  color: var(--timestamp);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.messages { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.message { border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
.message.user { background: var(--user-bubble); }
.message.assistant { background: var(--assistant-bubble); }
.message-header {
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 0.88em;
}
.role-label { font-weight: 600; }
.message.user .role-label { color: var(--user-text); }
.message.assistant .role-label { color: var(--accent); }
.slash-cmd {
  background: var(--accent);
  color: var(--bg);
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 0.82em;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}
.agent-name {
  color: var(--accent);
  font-style: italic;
  font-size: 0.85em;
}
.timestamp { color: var(--timestamp); margin-left: auto; font-size: 0.82em; }
.message-body { padding: 12px 16px; }
.message-body > *:first-child { margin-top: 0; }
.message-body > *:last-child { margin-bottom: 0; }
.message-body pre {
  background: var(--code-bg) !important;
  border-radius: 6px;
  padding: 12px 14px;
  overflow-x: auto;
  margin: 8px 0;
  border: 1px solid var(--border);
}
.message-body pre code {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.88em;
}
.message-body code:not(pre code) {
  background: var(--code-bg);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.9em;
}
.message-body a { color: var(--accent); }
.message-body blockquote {
  border-left: 3px solid var(--accent);
  margin: 8px 0;
  padding: 4px 12px;
  color: var(--timestamp);
}
.message-body table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.message-body th, .message-body td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
}
.message-body th { background: var(--surface); }
</style>
</head>
<body>
<div class="container">
${body}
</div>
</body>
</html>`;
}

function buildPreviewFragment(session: ChatSession, messages: ChatMessage[], theme: Theme): string {
  const isLight = theme.id === 'light-classic';
  const hljsCss = isLight ? hljsLightCss : hljsDarkCss;
  const c = theme.colors;
  const body = renderSessionHtml(session, messages);

  return `<style>
${hljsCss}
:root {
  --bg: ${c.background}; --surface: ${c.surface};
  --user-bubble: ${c.userBubble}; --assistant-bubble: ${c.assistantBubble};
  --user-text: ${c.userText}; --assistant-text: ${c.assistantText};
  --accent: ${c.accent}; --border: ${c.border};
  --code-bg: ${c.codeBackground}; --code-text: ${c.codeText};
  --timestamp: ${c.timestamp}; --header-bg: ${c.headerBackground};
}
body { background: var(--bg); color: var(--assistant-text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 12px; line-height: 1.6; font-size: 14px; }
.session { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.session-header { background: var(--header-bg); padding: 12px 16px; border-bottom: 1px solid var(--border); }
.session-header h2 { margin: 0 0 4px; color: var(--accent); font-size: 1.05em; font-weight: 600; }
.session-meta { font-size: 0.8em; color: var(--timestamp); display: flex; gap: 10px; flex-wrap: wrap; }
.messages { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.message { border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.message.user { background: var(--user-bubble); }
.message.assistant { background: var(--assistant-bubble); }
.message-header { padding: 6px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); font-size: 0.85em; }
.role-label { font-weight: 600; }
.message.user .role-label { color: var(--user-text); }
.message.assistant .role-label { color: var(--accent); }
.slash-cmd { background: var(--accent); color: var(--bg); border-radius: 3px; padding: 1px 6px; font-size: 0.8em; font-family: monospace; }
.agent-name { color: var(--accent); font-style: italic; font-size: 0.82em; }
.timestamp { color: var(--timestamp); margin-left: auto; font-size: 0.8em; }
.message-body { padding: 10px 14px; }
.message-body > *:first-child { margin-top: 0; }
.message-body > *:last-child { margin-bottom: 0; }
.message-body pre { background: var(--code-bg) !important; border-radius: 5px; padding: 10px 12px; overflow-x: auto; margin: 6px 0; border: 1px solid var(--border); }
.message-body pre code { font-family: monospace; font-size: 0.85em; }
.message-body code:not(pre code) { background: var(--code-bg); color: var(--accent); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 0.88em; }
.message-body a { color: var(--accent); }
</style>
${body}`;
}

function renderSessionHtml(session: ChatSession, messages: ChatMessage[]): string {
  const config = vscode.workspace.getConfiguration('aiChatExporter');
  const includeMetadata = config.get<boolean>('includeMetadata', true);

  const metaHtml = includeMetadata ? `
    <div class="session-meta">
      <span>${esc(session.workspaceDisplayName)}</span>
      <span>${new Date(session.createdAt).toLocaleDateString()}</span>
      <span>${esc(session.mode)}</span>
      <span>${esc(session.modelName)}</span>
    </div>` : '';

  const msgsHtml = messages.map(renderMessageHtml).join('\n');

  return `<section class="session">
  <div class="session-header">
    <h2>${esc(session.title)}</h2>${metaHtml}
  </div>
  <div class="messages">${msgsHtml}</div>
</section>`;
}

function renderMessageHtml(msg: ChatMessage): string {
  const role = msg.role === 'user' ? 'user' : 'assistant';
  const label = msg.role === 'user' ? 'You' : 'GitHub Copilot';

  const badgeParts: string[] = [];
  if (msg.agentName) {
    badgeParts.push(`<span class="agent-name">${esc(msg.agentName)}</span>`);
  }
  if (msg.slashCommand) {
    badgeParts.push(`<span class="slash-cmd">${esc(msg.slashCommand)}</span>`);
  }
  const badges = badgeParts.join(' ');
  const ts = msg.timestamp
    ? `<span class="timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>`
    : '';

  const renderedMd = marked.parse(msg.text) as string;

  return `
  <div class="message ${role}">
    <div class="message-header">
      <span class="role-label">${label}</span>${badges ? ' ' + badges : ''}${ts}
    </div>
    <div class="message-body">${renderedMd}</div>
  </div>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Only allow color values that match safe CSS color formats
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\))$/;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}
