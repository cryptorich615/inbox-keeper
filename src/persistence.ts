import { sampleEmails } from './data';
import type { AuditEvent, Email } from './types';

export type ThemePreference = 'light' | 'dark' | 'system';
export interface PersistedState {
  version: 1;
  emails: Email[];
  protectedSenders: string[];
  protectedDomains: string[];
  audit: AuditEvent[];
  theme: ThemePreference;
}

export const STORAGE_KEY = 'inbox-keeper:v1';
export const DEFAULT_SENDERS = ['alerts@mybank.example', 'mom@family.example'];
export const DEFAULT_DOMAINS = ['family.example'];

export function defaultState(): PersistedState {
  return { version: 1, emails: sampleEmails, protectedSenders: DEFAULT_SENDERS, protectedDomains: DEFAULT_DOMAINS, audit: [], theme: 'system' };
}

export function loadState(storage: Pick<Storage, 'getItem'> = localStorage): PersistedState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const value = JSON.parse(raw) as Partial<PersistedState>;
    const validEmail = (email: unknown): email is Email => {
      if (!email || typeof email !== 'object') return false;
      const candidate = email as Partial<Email>;
      return typeof candidate.id === 'string' && typeof candidate.sender === 'string' &&
        typeof candidate.address === 'string' && typeof candidate.subject === 'string' &&
        typeof candidate.preview === 'string' && typeof candidate.date === 'string' &&
        typeof candidate.size === 'number' && Number.isFinite(candidate.size) && candidate.size >= 0 &&
        typeof candidate.read === 'boolean' && typeof candidate.starred === 'boolean' &&
        typeof candidate.attachment === 'boolean' && typeof candidate.category === 'string' &&
        typeof candidate.trashed === 'boolean';
    };
    const validAudit = (event: unknown): event is AuditEvent => {
      if (!event || typeof event !== 'object') return false;
      const candidate = event as Partial<AuditEvent>;
      return typeof candidate.id === 'string' && typeof candidate.action === 'string' &&
        typeof candidate.count === 'number' && Number.isInteger(candidate.count) && candidate.count >= 0 &&
        typeof candidate.detail === 'string' && typeof candidate.at === 'string';
    };
    if (value.version !== 1 || !Array.isArray(value.emails) || !value.emails.every(validEmail) ||
      !Array.isArray(value.protectedSenders) || !value.protectedSenders.every(item => typeof item === 'string') ||
      !Array.isArray(value.protectedDomains) || !value.protectedDomains.every(item => typeof item === 'string') ||
      !Array.isArray(value.audit) || !value.audit.every(validAudit)) return defaultState();
    const theme = value.theme === 'light' || value.theme === 'dark' || value.theme === 'system' ? value.theme : 'system';
    return { version: 1, emails: value.emails, protectedSenders: value.protectedSenders, protectedDomains: value.protectedDomains, audit: value.audit, theme };
  } catch {
    return defaultState();
  }
}

export function saveState(state: PersistedState, storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function effectiveTheme(preference: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}
