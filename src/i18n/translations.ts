export const translations = {
  en: {
    // Status / Loading
    loading: 'Loading sessions\u2026',
    loadingShort: 'Loading\u2026',
    ready: 'Ready',
    sessionsLoaded: '{count} session(s) loaded',
    exportedFiles: '\u2713 Exported {count} file(s) to {path}',
    errorPrefix: '\u26a0 {message}',

    // Message panel
    selectSession: 'Select a session',
    noSessions: 'No Copilot Chat sessions found.',
    selectToExport: 'Select at least one session to export.',

    // Roles
    roleYou: 'Prompt',
    roleCopilot: 'Copilot',

    // Scope badges
    scopeCurrent: 'Current workspace',
    scopeAll: 'All workspaces',

    // Message count suffixes
    msgsSuffix: 'msgs',
    msgSuffix: 'msg',

    // Toolbar buttons / tooltips
    btnRefresh: '\u8635 Refresh',
    btnRefreshTitle: 'Refresh sessions',
    btnExportMd: 'Export MD',
    btnExportMdTitle: 'Export selected sessions to Markdown',
    btnExportHtml: 'Export HTML',
    btnExportHtmlTitle: 'Export selected sessions to HTML',
    btnSettings: '\u2699',
    btnSettingsTitle: 'Open settings',
    btnAll: 'All',
    btnNone: 'None',
    btnToggleUser: 'Prompt',
    btnToggleUserTitle: 'Check/uncheck all prompt messages',
    btnToggleCopilot: 'Copilot',
    btnToggleCopilotTitle: 'Check/uncheck all Copilot messages',
    btnAllWs: 'All WS',
    btnShowAllTitle: 'Show sessions from all workspaces',
    themeSelectTitle: 'HTML export theme',

    // Dialogs (extension host)
    noSessionsSelected: 'No sessions selected for export.',
    exportedMd: 'Exported {count} session(s) to Markdown.',
    exportedHtml: 'Exported {count} session(s) to HTML.',
    openFolder: 'Open Folder',
    exportFailed: 'Export failed: {message}',
    exportLabel: 'Export',
    selectFolder: 'Select Export Folder',

    // Exporter content
    headerYou: 'Prompt',
    headerCopilot: 'GitHub Copilot',
    metaWorkspace: 'Workspace',
    metaDate: 'Date',
    metaMode: 'Mode',
    metaModel: 'Model',
    htmlPageTitle: 'Copilot Chat Export',
    noWorkspace: 'No Workspace',
  },
  de: {
    // Status / Loading
    loading: 'Sessions werden geladen\u2026',
    loadingShort: 'Laden\u2026',
    ready: 'Bereit',
    sessionsLoaded: '{count} Session(s) geladen',
    exportedFiles: '\u2713 {count} Datei(en) exportiert nach {path}',
    errorPrefix: '\u26a0 {message}',

    // Message panel
    selectSession: 'Session ausw\u00e4hlen',
    noSessions: 'Keine Copilot Chat Sessions gefunden.',
    selectToExport: 'Mindestens eine Session zum Exportieren ausw\u00e4hlen.',

    // Roles
    roleYou: 'Prompt',
    roleCopilot: 'Copilot',

    // Scope badges
    scopeCurrent: 'Aktueller Workspace',
    scopeAll: 'Alle Workspaces',

    // Message count suffixes
    msgsSuffix: 'Nachr.',
    msgSuffix: 'Nachr.',

    // Toolbar buttons / tooltips
    btnRefresh: '\u8635 Aktualisieren',
    btnRefreshTitle: 'Sessions aktualisieren',
    btnExportMd: 'MD exportieren',
    btnExportMdTitle: 'Ausgew\u00e4hlte Sessions als Markdown exportieren',
    btnExportHtml: 'HTML exportieren',
    btnExportHtmlTitle: 'Ausgew\u00e4hlte Sessions als HTML exportieren',
    btnSettings: '\u2699',
    btnSettingsTitle: 'Einstellungen \u00f6ffnen',
    btnAll: 'Alle',
    btnNone: 'Keine',
    btnToggleUser: 'Prompt',
    btnToggleUserTitle: 'Prompt-Nachrichten an-/abhaken',
    btnToggleCopilot: 'Copilot',
    btnToggleCopilotTitle: 'Copilot-Nachrichten an-/abhaken',
    btnAllWs: 'Alle WS',
    btnShowAllTitle: 'Sessions aller Workspaces anzeigen',
    themeSelectTitle: 'HTML-Exportthema',

    // Dialogs (extension host)
    noSessionsSelected: 'Keine Sessions zum Exportieren ausgew\u00e4hlt.',
    exportedMd: '{count} Session(s) als Markdown exportiert.',
    exportedHtml: '{count} Session(s) als HTML exportiert.',
    openFolder: 'Ordner \u00f6ffnen',
    exportFailed: 'Export fehlgeschlagen: {message}',
    exportLabel: 'Exportieren',
    selectFolder: 'Exportordner ausw\u00e4hlen',

    // Exporter content
    headerYou: 'Prompt',
    headerCopilot: 'GitHub Copilot',
    metaWorkspace: 'Workspace',
    metaDate: 'Datum',
    metaMode: 'Modus',
    metaModel: 'Modell',
    htmlPageTitle: 'Copilot Chat Export',
    noWorkspace: 'Kein Workspace',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
