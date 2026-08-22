/**
 * Storage boundaries, stated once so they are easy to audit.
 *
 *   chrome.storage.session — per-visit evidence. Held in memory by Chrome and
 *                            discarded when the browser closes. Never on disk.
 *   chrome.storage.local   — settings and the aggregate privacy history, which
 *                            the user explicitly opts into and can erase.
 *
 * No URL, page title, or cookie value is ever written to storage.local.
 */
import type { VisitEvidence } from '../domain/types';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings';

const VISIT_PREFIX = 'visit:';
const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadVisit(tabId: number): Promise<VisitEvidence | null> {
  const key = VISIT_PREFIX + tabId;
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as VisitEvidence | undefined) ?? null;
}

export async function saveVisit(visit: VisitEvidence): Promise<void> {
  await chrome.storage.session.set({ [VISIT_PREFIX + visit.tabId]: visit });
}

export async function dropVisit(tabId: number): Promise<void> {
  await chrome.storage.session.remove(VISIT_PREFIX + tabId);
}
