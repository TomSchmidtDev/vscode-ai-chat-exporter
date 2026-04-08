# AI Chat Exporter

> [English version](README.md)

Eine VS Code-Extension, mit der du deine **GitHub Copilot-Chatverläufe** direkt aus dem Editor heraus als Markdown oder gestyltes HTML exportieren kannst.

## Funktionen

- **Alle Chat-Sitzungen durchsuchen** in einem dedizierten Seitenbereich direkt in VS Code
- **Einzelne Nachrichten auswählen** pro Sitzung für teilweise Exporte
- **Benutzer-/Copilot-Nachrichten ein-/ausblenden** mit Toggle-Buttons, um einzelne Rollen vom Export auszuschließen
- **Export als Markdown** (`.md`) — sauber, portabel, direkt einfügbar
- **Export als HTML** (`.html`) — vollständig gestylt mit Syntax-Highlighting für Codeblöcke
- **10 eingebaute Farbthemen** für die HTML-Ausgabe: Catppuccin Mocha, GitHub Dark, Dracula, Nord, Tokyo Night, One Dark, Monokai Pro, Material Ocean, Solarized Dark, Light Classic
- **Eigenes Farbprofil** — alle HTML-Farben individuell über die VS Code-Einstellungen konfigurierbar
- **Nur-Lesen-Zugriff** — deine Copilot-Chatdaten werden niemals verändert

## Installation

### Über den VS Code Marketplace

1. Öffne VS Code
2. Gehe zu **Erweiterungen** (`Strg+Umschalt+X` / `Cmd+Umschalt+X`)
3. Suche nach **AI Chat Exporter**
4. Klicke auf **Installieren**

### Manuelle Installation per VSIX

1. Lade die `.vsix`-Datei von der [Releases](https://github.com/TomSchmidtDev/vscode-ai-chat-exporter/releases)-Seite herunter
2. Öffne in VS Code das Erweiterungen-Panel
3. Klicke auf das `···`-Menü → **Aus VSIX installieren…**
4. Wähle die heruntergeladene Datei aus

## Verwendung

1. Klicke auf das **AI Chat Exporter**-Symbol in der Aktivitätsleiste (linke Seitenleiste)
2. Das Panel zeigt alle gefundenen GitHub Copilot-Chat-Sitzungen, gruppiert nach Workspace
3. Wähle die gewünschten Sitzungen über die Checkboxen aus
4. Blende optional mit den **You**- / **Copilot**-Buttons einzelne Nachrichtenrollen ein oder aus
5. Klicke auf **Export MD** oder **Export HTML** und wähle einen Speicherort

## Einstellungen

Öffne **Datei → Einstellungen → Einstellungen** und suche nach `AI Chat Exporter`:

| Einstellung | Standard | Beschreibung |
|---|---|---|
| `aiChatExporter.defaultTheme` | `github-dark` | Farbthema für den HTML-Export |
| `aiChatExporter.outputDirectory` | *(leer)* | Standard-Exportordner (leer = jedes Mal nachfragen) |
| `aiChatExporter.includeMetadata` | `true` | Sitzungs-Metadaten (Datum, Modell, Workspace) einschließen |
| `aiChatExporter.codeHighlighting` | `true` | Syntax-Highlighting im HTML-Export aktivieren |
| `aiChatExporter.storageBasePath` | *(leer)* | VS Code-Speicherpfad überschreiben (für Insiders oder angepasste Installationen) |
| `aiChatExporter.customColors` | `{}` | Einzelne Farben des benutzerdefinierten Themes überschreiben |

## Voraussetzungen

- VS Code 1.85 oder neuer
- GitHub Copilot-Extension installiert und mindestens eine Chat-Sitzung aufgezeichnet

## Funktionsweise

Die Extension liest GitHub Copilot-Chat-Sitzungen aus dem lokalen Workspace-Speicher von VS Code (typischerweise unter `~/.config/Code/User/workspaceStorage` unter Linux, `~/Library/Application Support/Code/User/workspaceStorage` unter macOS oder `%APPDATA%\Code\User\workspaceStorage` unter Windows). Es werden keine Netzwerkanfragen gestellt.

## Datenschutz

Diese Extension erfasst, überträgt oder speichert keinerlei personenbezogene Daten. Alle Operationen werden lokal auf deinem Gerät ausgeführt. Es werden keine Telemetrie-, Analyse- oder Netzwerkanfragen durchgeführt — über das hinaus, was VS Code selbst ausführt.

## Lizenz

Business Source License 1.1 — kostenlos für private und nicht-kommerzielle Nutzung sowie den internen Einsatz in Unternehmen. Wird am 2031-04-04 automatisch zur Apache 2.0. Details in [LICENSE.md](LICENSE.md).
