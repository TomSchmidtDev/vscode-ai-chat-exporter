import * as vscode from 'vscode';
import { translations, TranslationKey } from './translations';

export function getLanguage(): 'en' | 'de' {
  const setting = vscode.workspace.getConfiguration('aiChatExporter').get<string>('language', 'auto');
  if (setting === 'de') { return 'de'; }
  if (setting === 'en') { return 'en'; }
  return vscode.env.language.startsWith('de') ? 'de' : 'en';
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const lang = getLanguage();
  let str: string = translations[lang][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

/** Serialized translation map for injection into the webview */
export function getWebviewTranslations(): Record<string, string> {
  return translations[getLanguage()] as Record<string, string>;
}
