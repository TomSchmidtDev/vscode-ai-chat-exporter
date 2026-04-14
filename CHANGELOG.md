# Changelog

All notable changes to AI Chat Exporter will be documented in this file.

## [0.3.0] - 2026-04-14

### Added
- **Internationalization (EN / DE)**: All UI labels, dialogs, status messages, and export content are now translated
- Language follows VS Code's display language by default (`auto`)
- New setting `aiChatExporter.language` (`auto` / `en` / `de`) to override the language manually

## [0.2.2] - 2026-04-14

### Fixed
- **Still-missing messages**: `kind=2` JSONL patches with an all-string key path append items to the existing array instead of replacing it — this is how Copilot Chat adds new requests one-by-one to a session. Previously every new request overwrote the previous ones, leaving only the last request visible. `kind=2` patches with a numeric index in the path (e.g. `["requests", 2, "response"]`) still perform a targeted SET to attach completed responses.

## [0.2.1] - 2026-04-14

### Fixed
- **Missing messages**: JSONL session files use an incremental patch format (`kind=1`/`kind=2` entries) that was silently ignored — the parser now applies all patches on top of the base `kind=0` snapshot, so all conversation messages are correctly loaded
- **Empty-window sessions**: Sessions created in VS Code windows without an open workspace are now included in the "All Workspaces" view (loaded from `globalStorage/emptyWindowChatSessions/`)

## [0.2.0] - 2026-04-14

### Added
- Session list now shows only the **current workspace** by default, matching exactly what Copilot Chat displays
- New **"All WS"** toggle button to switch between current-workspace and all-workspaces view
- Scope badge below session actions bar indicates active filter ("Current workspace" / "All workspaces")

### Changed
- Workspace detection now uses `ExtensionContext.storageUri` (same hash VS Code and Copilot Chat use internally) instead of URI path matching — eliminates mismatches caused by encoding, case, or symlinks
- `loadWorkspaceFromHashDir()` extracted as a reusable function for both single- and all-workspace loading

## [0.1.1] - 2026-04-08

### Fixed
- Session list now sorted by most recent activity first (workspaces ordered by newest session)
- Support for new `.jsonl` session format introduced in GitHub Copilot Chat v0.42+
- Sessions from the two-panel redesign: most recent session auto-selected and shown on load

### Security
- Nonce generation replaced with `crypto.randomBytes` (CSPRNG) instead of `Math.random()`
- Removed `'unsafe-inline'` from webview CSP `style-src`
- `marked` renderer now escapes raw HTML tokens to prevent prompt-injected markup in HTML exports
- `esc()` helper extended to also escape single quotes (`&#x27;`)
- `customColors` setting values validated against a strict CSS color regex before CSS interpolation
- Session ID escaped before use in CSS attribute selectors (`querySelector`)

### Stability
- Malformed session files no longer abort loading of all remaining sessions (per-file isolation)
- Webview `exportMd`/`exportHtml` messages validated for correct shape before processing
- Response part `.value` type-checked before use; avoids literal `"undefined"` in exports
- Export filename falls back to sanitized session ID when title reduces to empty string

## [0.1.0] - 2026-04-08

### Added
- Initial release
- Browse all GitHub Copilot Chat sessions grouped by workspace
- Select individual sessions and messages for export
- Toggle buttons to filter user ("You") and assistant ("Copilot") messages
- Export to Markdown (`.md`) with clean formatting
- Export to HTML (`.html`) with syntax-highlighted code blocks
- 10 built-in color themes: Catppuccin Mocha, GitHub Dark, Dracula, Nord, Tokyo Night, One Dark, Monokai Pro, Material Ocean, Solarized Dark, Light Classic
- Custom color profile via VS Code settings
- Live preview panel inside the sidebar
- Cross-platform support: macOS, Windows, Linux
- VS Code Insiders support via configurable storage base path
