/**
 * The tracker knowledge graph: domain → service → organization → parent.
 *
 * This layer answers "who is this and what are they for" from curated data.
 * It never looks at the current page, and it never guesses: an unmatched domain
 * comes back as `known: false` so the interface can say so out loud.
 */
import type { Category, CookieKnowledge, Organization, TrackerEntry } from '../domain/types';
import { FUNCTIONAL_CATEGORIES } from '../domain/types';
import { hostSuffixes } from '../domain/site';
import organizationsData from './organizations.json';
import trackersData from './trackers.json';
import cookiesData from './cookies.json';

const organizations = new Map<string, Organization>(
  (organizationsData.organizations as Organization[]).map((o) => [o.id, o])
);

const trackers = trackersData.trackers as TrackerEntry[];
const trackersById = new Map(trackers.map((t) => [t.id, t]));

/** host or registrable domain → entries owning it, refined entries first. */
const byDomain = new Map<string, TrackerEntry[]>();
for (const entry of trackers) {
  for (const domain of entry.domains) {
    const list = byDomain.get(domain) ?? [];
    if (entry.urlIncludes) list.unshift(entry);
    else list.push(entry);
    byDomain.set(domain, list);
  }
}

const cookieKnowledge = cookiesData.cookies as CookieKnowledge[];
const exactCookies = new Map<string, CookieKnowledge>();
const prefixCookies: { prefix: string; entry: CookieKnowledge }[] = [];
for (const entry of cookieKnowledge) {
  if (entry.name.endsWith('*')) prefixCookies.push({ prefix: entry.name.slice(0, -1), entry });
  else exactCookies.set(entry.name.toLowerCase(), entry);
}
prefixCookies.sort((a, b) => b.prefix.length - a.prefix.length);

export const KNOWLEDGE_VERSION = trackersData.version;
export const TRACKER_COUNT = trackers.length;

/**
 * Identify the service behind one request.
 * Most specific match wins: an exact host beats a parent domain, and an entry
 * that also constrains the URL beats one that only owns the domain.
 */
export function identifyRequest(url: string, hostname: string): TrackerEntry | null {
  for (const suffix of hostSuffixes(hostname)) {
    const candidates = byDomain.get(suffix);
    if (!candidates) continue;
    for (const entry of candidates) {
      if (!entry.urlIncludes) return entry;
      if (entry.urlIncludes.some((fragment) => url.includes(fragment))) return entry;
    }
  }
  return null;
}

export function entryById(id: string): TrackerEntry | null {
  return trackersById.get(id) ?? null;
}

export function organizationById(id: string): Organization | null {
  return organizations.get(id) ?? null;
}


export function identifyCookie(name: string): CookieKnowledge | null {
  const exact = exactCookies.get(name.toLowerCase());
  if (exact) return exact;
  for (const { prefix, entry } of prefixCookies) {
    if (name.toLowerCase().startsWith(prefix.toLowerCase())) return entry;
  }
  return null;
}

export function isFunctional(category: Category): boolean {
  return FUNCTIONAL_CATEGORIES.includes(category);
}

/**
 * Domains Veyl would block under full protection: tracking that no page needs.
 *
 * Three things are excluded, and each exclusion exists because including it
 * would break a page a person was trying to use:
 *   - anything a site needs to function (sign-in, payment, bot checks, CDNs);
 *   - domains shared between a tracker and something else, told apart only by
 *     URL, where a domain-wide block would catch the wrong thing;
 *   - a tracker's own website and the CDN serving its content.
 */
export function blockableDomains(): { domain: string; entryId: string; category: Category }[] {
  const out: { domain: string; entryId: string; category: Category }[] = [];
  for (const entry of trackers) {
    if (isFunctional(entry.category)) continue;
    if (entry.urlIncludes) continue;
    if (entry.category === 'unknown' || entry.category === 'hosting') continue;
    for (const domain of entry.domains) {
      if (entry.neverBlock?.includes(domain)) continue;
      out.push({ domain, entryId: entry.id, category: entry.category });
    }
  }
  return out;
}

/** Specific tracking endpoints to block on domains that must otherwise stay reachable. */
export function blockableUrlFilters(): { filter: string; entryId: string; category: Category }[] {
  return trackers
    .filter((entry) => entry.blockUrlFilters && !isFunctional(entry.category))
    .flatMap((entry) =>
      entry.blockUrlFilters!.map((filter) => ({ filter, entryId: entry.id, category: entry.category }))
    );
}

/** Every domain any entry has marked as unsafe to block. */
export function neverBlockedDomains(): Set<string> {
  return new Set(trackers.flatMap((entry) => entry.neverBlock ?? []));
}

export const allTrackers = trackers;
