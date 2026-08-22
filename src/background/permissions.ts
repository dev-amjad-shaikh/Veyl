import { ALL_SITE_PATTERNS } from '../domain/settings';

/**
 * Veyl asks for nothing at install time.
 *
 * Chrome's install prompt is the moment a privacy product either earns trust or
 * loses it, so the manifest requests no host access at all. Watching a site is
 * a decision you make per site, in context, with the site's name in the prompt.
 * "Protect every site" is a separate, later decision.
 *
 * Because nothing is declared in the manifest, the page scripts are registered
 * at runtime and always match exactly the origins you have granted — the set of
 * sites Veyl can see is the set you approved, enforced by Chrome rather than by
 * our good intentions.
 */

const PROBE_ID = 'veyl-probe';
const COLLECTOR_ID = 'veyl-collector';

export interface Access {
  origins: string[];
  allSites: boolean;
}

export async function currentAccess(): Promise<Access> {
  const granted = await chrome.permissions.getAll();
  const origins = granted.origins ?? [];
  return {
    origins,
    allSites: ALL_SITE_PATTERNS.every((pattern) => origins.includes(pattern)),
  };
}

export function originPatternFor(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    return `${protocol}//${hostname}/*`;
  } catch {
    return null;
  }
}

export async function hasAccessTo(url: string): Promise<boolean> {
  const pattern = originPatternFor(url);
  if (!pattern) return false;
  return chrome.permissions.contains({ origins: [pattern] });
}

/**
 * Keeps the registered page scripts in step with what you have granted.
 * Called on startup and whenever permissions change.
 */
export async function syncPageScripts(): Promise<void> {
  const { origins, allSites } = await currentAccess();
  const matches = allSites ? ALL_SITE_PATTERNS : origins.filter((o) => o.startsWith('http'));

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [PROBE_ID, COLLECTOR_ID] });
  const existingIds = existing.map((script) => script.id);

  if (matches.length === 0) {
    if (existingIds.length > 0) await chrome.scripting.unregisterContentScripts({ ids: existingIds });
    return;
  }

  const scripts: chrome.scripting.RegisteredContentScript[] = [
    {
      id: PROBE_ID,
      matches,
      js: ['probe.js'],
      runAt: 'document_start',
      allFrames: true,
      world: 'MAIN',
      persistAcrossSessions: true,
    },
    {
      id: COLLECTOR_ID,
      matches,
      js: ['collector.js'],
      runAt: 'document_start',
      allFrames: true,
      world: 'ISOLATED',
      persistAcrossSessions: true,
    },
  ];

  if (existingIds.length > 0) {
    await chrome.scripting.updateContentScripts(scripts.filter((s) => existingIds.includes(s.id)));
    const missing = scripts.filter((s) => !existingIds.includes(s.id));
    if (missing.length > 0) await chrome.scripting.registerContentScripts(missing);
  } else {
    await chrome.scripting.registerContentScripts(scripts);
  }
}
