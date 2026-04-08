# AI Chat Exporter

> [Deutsche Version](README.de.md)

A VS Code extension that lets you export your **GitHub Copilot Chat history** to Markdown or styled HTML — directly from your editor.

## Features

- **Browse all chat sessions** in a dedicated sidebar panel, right inside VS Code
- **Select individual messages** per session for partial exports
- **Toggle user/Copilot messages** to include or exclude each role from the export
- **Export to Markdown** (`.md`) — clean, portable, paste-ready
- **Export to HTML** (`.html`) — fully styled with syntax-highlighted code blocks
- **10 built-in color themes** for HTML output: Catppuccin Mocha, GitHub Dark, Dracula, Nord, Tokyo Night, One Dark, Monokai Pro, Material Ocean, Solarized Dark, Light Classic
- **Custom color profile** — configure all HTML colors individually via VS Code settings
- **Read-only access** — your Copilot chat data is never modified

## Installation

### Via VS Code Marketplace

1. Open VS Code
2. Go to **Extensions** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **AI Chat Exporter**
4. Click **Install**

### Manual installation from VSIX

1. Download the `.vsix` file from the [Releases](https://github.com/TomSchmidtDev/vscode-ai-chat-exporter/releases) page
2. In VS Code, open the Extensions panel
3. Click the `···` menu → **Install from VSIX…**
4. Select the downloaded file

## Usage

1. Click the **AI Chat Exporter** icon in the Activity Bar (left sidebar)
2. The panel shows all discovered GitHub Copilot chat sessions grouped by workspace
3. Select the sessions you want to export using the checkboxes
4. Optionally toggle the **You** / **Copilot** buttons to filter which message roles are included
5. Click **Export MD** or **Export HTML** and choose a save location

## Settings

Open **File → Preferences → Settings** and search for `AI Chat Exporter` to configure:

| Setting | Default | Description |
|---|---|---|
| `aiChatExporter.defaultTheme` | `github-dark` | Color theme for HTML export |
| `aiChatExporter.outputDirectory` | *(empty)* | Default export folder (empty = prompt each time) |
| `aiChatExporter.includeMetadata` | `true` | Include session metadata (date, model, workspace) |
| `aiChatExporter.codeHighlighting` | `true` | Enable syntax highlighting in HTML export |
| `aiChatExporter.storageBasePath` | *(empty)* | Override VS Code storage path (for Insiders or custom installs) |
| `aiChatExporter.customColors` | `{}` | Override individual theme colors for the custom theme |

## Requirements

- VS Code 1.85 or later
- GitHub Copilot extension installed and at least one chat session recorded

## How It Works

The extension reads GitHub Copilot Chat sessions from VS Code's local workspace storage (typically under `~/.config/Code/User/workspaceStorage` on Linux, `~/Library/Application Support/Code/User/workspaceStorage` on macOS, or `%APPDATA%\Code\User\workspaceStorage` on Windows). No network requests are made.

## Privacy

This extension does not collect, transmit, or store any personal data. All operations are performed locally on your machine. No telemetry, analytics, or network requests are made beyond what VS Code itself performs.

## License

Business Source License 1.1 — free for personal, non-commercial, and internal business use. Converts to Apache 2.0 on 2031-04-04. See [LICENSE.md](LICENSE.md) for details.
