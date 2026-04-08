# CLAUDE.md — AI Chat Exporter (VS Code Extension)

Project-specific guidance for Claude Code when working in this repository.

---

## Versioning Policy

This project follows [Semantic Versioning](https://semver.org/). The version in `package.json` is the **base version**; the actual release version is set from the git tag at release time by the CI workflow.

| Change type | Version part | When to bump |
|---|---|---|
| Bug fix, build fix, dependency update | **Patch** (`x.y.Z`) | Every release that does not add new features |
| New feature (backwards-compatible) | **Minor** (`x.Y.0`) | Adding new export options, UI features, themes, settings, etc. |
| Breaking change due to VS Code API change | **Major** (`X.0.0`) | Only when minimum required VS Code engine version must be raised due to an incompatible API change |

**Rule: do not bump the major version for ordinary feature work.**

### How to release

1. Determine the target version according to the policy above.
2. Update `package.json` → `"version"` to the new version.
3. Add an entry to `CHANGELOG.md`.
4. Commit and push to `main`.
5. Create and push a git tag:
   - **Stable release**: `git tag v1.2.3 && git push origin v1.2.3`
   - **Preview/pre-release**: `git tag v1.2.3-preview && git push origin v1.2.3-preview`
6. The CI release workflow will:
   - Set the version in `package.json` from the tag automatically.
   - Build and package the `.vsix`.
   - Create a GitHub Release (marked as Pre-release for `-preview` tags).
   - **Only publish to the VS Code Marketplace if the tag does NOT contain `-preview`.**

---

## CI / GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Push to `main`, PRs | Builds the extension, bumps version to `x.y.z-build.<run_number>` for the artifact, uploads VSIX artifact (kept 7 days) |
| `release.yml` | Push of `v*` tag | Sets version from tag, builds, packages, creates GitHub Release; publishes to Marketplace only for non-preview tags |

**Required GitHub Secret for Marketplace publishing:**

| Secret | Value |
|---|---|
| `VSCE_PAT` | VS Code Marketplace Personal Access Token with scope `Marketplace → Manage` |

If `VSCE_PAT` is not set, the publish step is skipped silently — the GitHub Release (with VSIX) is always created.

> **Note:** `secrets` context cannot be used directly in `if:` expressions alongside step outputs (GitHub Actions limitation). The workflow uses a dedicated "Check VSCE_PAT availability" step that exposes the secret's presence as a step output (`steps.pat.outputs.available`), which is then safe to use in `if:` conditions.

---

## Node.js Version

Use **Node.js 20** or later. `@vscode/vsce` v3+ depends on `undici`, which uses the `File` global introduced in Node.js 20. Node.js 18 will fail with `ReferenceError: File is not defined`.

---

## Build System

```
npm run build           # full build (webview + extension)
npm run build:webview   # Vite build of webview-ui/src → media/main.js
npm run build:extension # esbuild of src/extension.ts → out/extension.js
npm run package         # build + vsce package (produces *.vsix)
npm run publish         # build + vsce publish (requires VSCE_PAT env var)
```

The esbuild config (`esbuild.js`) uses `loader: { '.css': 'text' }` — this is required to inline highlight.js CSS into self-contained HTML exports.

---

## Marketplace Compliance

- Icon: `media/icon.png` (128×128 PNG, required)
- `publisher` field in `package.json`: `TomSchmidtDev`
- `license`: `SEE LICENSE IN LICENSE.md`
- `repository`, `bugs`, `homepage` fields must be present
- `galleryBanner` sets the Marketplace banner color
- The extension uses `--no-dependencies` when packaging (dependencies are bundled via esbuild)

**To set up Marketplace publishing:**
1. Create a publisher at https://marketplace.visualstudio.com/manage
2. Generate a PAT at https://dev.azure.com → User Settings → Personal access tokens (Scope: `Marketplace → Manage`)
3. Add the PAT as `VSCE_PAT` secret in GitHub repository settings

---

## Architecture Notes

- **Extension host** (`src/`): TypeScript compiled via esbuild, runs in VS Code extension context
- **Webview UI** (`webview-ui/src/`): Vite-bundled, pure DOM manipulation (no innerHTML) — security hooks reject innerHTML usage
- **Message protocol**: `ExtensionToWebview` / `WebviewToExtension` types in `src/types.ts`
- **Storage reader**: reads `~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/*.json` (macOS); platform paths in `src/storage/pathResolver.ts`
- **HTML export**: self-contained with inlined highlight.js CSS; theme colors from `src/themes/themes.ts`

---

## Security

- The webview does not use `innerHTML` — all DOM is built with `createElement`/`textContent`/`appendChild`
- CSP: `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-...'`
- User-provided content is HTML-escaped via `esc()` before inclusion in HTML exports
- GitHub Actions workflows do not interpolate untrusted event payloads into `run:` commands
