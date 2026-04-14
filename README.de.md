# AI Chat Exporter

> [English version](README.md)

Eine VS Code-Extension, mit der du deine **GitHub Copilot-Chatverläufe** direkt aus dem Editor heraus als Markdown oder gestyltes HTML exportieren kannst.

## Funktionen

- **Zweispaltiges Seitenbereich-Layout** — Sitzungsliste links, Nachrichtenvorschau rechts
- **Aktueller-Workspace-Filter** — zeigt standardmäßig nur Sitzungen des aktiven Workspaces; **Alle WS** umschalten, um Sitzungen aller Workspaces anzuzeigen
- **Sitzungen ohne Workspace** — Sitzungen, die ohne geöffneten Workspace-Ordner erstellt wurden, sind in der Alle-WS-Ansicht enthalten
- **Einzelne Nachrichten auswählen** pro Sitzung für teilweise Exporte
- **Prompt- / Copilot-Nachrichten ein-/ausblenden** mit Toggle-Buttons, um einzelne Rollen vom Export auszuschließen
- **Speichern-unter-Dialog bei Einzelsitzungen** — beim Export einer einzelnen Sitzung öffnet sich ein Datei-Picker mit vorausgefülltem Dateinamen; bei mehreren Sitzungen wird ein Ordner-Picker angezeigt
- **Export als Markdown** (`.md`) — sauber, portabel, direkt einfügbar
- **Export als HTML** (`.html`) — vollständig gestylt mit Syntax-Highlighting für Codeblöcke
- **10 eingebaute Farbthemen** für die HTML-Ausgabe: Catppuccin Mocha, GitHub Dark, Dracula, Nord, Tokyo Night, One Dark, Monokai Pro, Material Ocean, Solarized Dark, Light Classic
- **Eigenes Farbprofil** — alle HTML-Farben individuell über die VS Code-Einstellungen konfigurierbar
- **Mehrsprachigkeit** — Oberfläche und Exportausgaben auf Englisch oder Deutsch; folgt automatisch der VS Code-Anzeigesprache oder kann manuell eingestellt werden
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
2. Das linke Panel zeigt alle GitHub Copilot-Chat-Sitzungen des aktuellen Workspaces
3. Klicke auf **Alle WS**, um Sitzungen aller Workspaces anzuzeigen
4. Klicke auf eine Sitzung, um ihre Nachrichten im rechten Panel zu sehen
5. Wähle Sitzungen über die Checkboxen aus; **Alle** / **Keine** markiert oder demarkiert alle
6. Blende optional mit den **Prompt**- / **Copilot**-Buttons einzelne Nachrichtenrollen ein oder aus
7. Wähle ein HTML-Theme aus dem Dropdown und klicke auf **MD exportieren** oder **HTML exportieren**
8. Bei einer einzelnen Sitzung öffnet sich ein Speichern-unter-Dialog mit vorausgefülltem Dateinamen; bei mehreren Sitzungen wird ein Zielordner gewählt

## Einstellungen

Öffne **Datei → Einstellungen → Einstellungen** und suche nach `AI Chat Exporter`:

| Einstellung | Standard | Beschreibung |
|---|---|---|
| `aiChatExporter.language` | `auto` | Sprache für Oberfläche und Export: `auto` (VS Code folgen), `en` oder `de` |
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

Der aktuelle Workspace wird über VS Codes eigenen Speicher-Hash identifiziert — so stimmt die Anzeige exakt mit dem überein, was Copilot Chat selbst zeigt, ohne URI-Vergleiche oder Pfadschätzungen.

## Datenschutz

Diese Extension erfasst, überträgt oder speichert keinerlei personenbezogene Daten. Alle Operationen werden lokal auf deinem Gerät ausgeführt. Es werden keine Telemetrie-, Analyse- oder Netzwerkanfragen durchgeführt — über das hinaus, was VS Code selbst ausführt.

## Lizenz

Business Source License 1.1 — kostenlos für private und nicht-kommerzielle Nutzung sowie den internen Einsatz in Unternehmen. Wird am 2031-04-04 automatisch zur Apache 2.0. Details in [LICENSE.md](LICENSE.md).
