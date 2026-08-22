/**
 * Cookie inventory for one visit.
 *
 * Veyl asks Chrome only about the site you are on and the third-party domains
 * that this page actually contacted. It never enumerates the whole cookie jar,
 * and cookie values are inspected in memory to classify them but are never
 * stored or transmitted.
 */
import type { CookieObservation, Site, VisitEvidence } from '../domain/types';
import { cookieSite } from '../domain/site';

const MAX_THIRD_PARTY_DOMAINS = 40;

/** A value that looks like a stable per-person identifier rather than a setting. */
export function looksLikeIdentifier(value: string): boolean {
  if (value.length < 10 || value.length > 512) return false;
  if (/^[0-9]+$/.test(value) && value.length < 13) return false; // plain counters/timestamps
  const distinct = new Set(value).size;
  if (distinct < 6) return false;
  return (
    /^[0-9a-f]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
    /^[A-Za-z0-9_-]{16,}={0,2}$/.test(value) ||
    /(^|\.)GA\d\.\d+\.\d+\.\d+/.test(value) ||
    /^[A-Za-z0-9+/]{20,}={0,2}$/.test(value)
  );
}

function toObservation(cookie: chrome.cookies.Cookie, site: Site): CookieObservation {
  const owner = cookieSite(cookie.domain);
  const observation: CookieObservation = {
    name: cookie.name,
    domain: cookie.domain.replace(/^\./, ''),
    thirdParty: owner !== site,
    session: cookie.session,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite ?? 'unspecified',
    looksLikeIdentifier: looksLikeIdentifier(cookie.value),
  };
  if (!cookie.session && cookie.expirationDate) {
    observation.lifetimeDays = Math.max(0, Math.round((cookie.expirationDate * 1000 - Date.now()) / 86_400_000));
  }
  return observation;
}

async function safeGetAll(details: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]> {
  try {
    return await chrome.cookies.getAll(details);
  } catch {
    return [];
  }
}

export async function collectCookies(visit: VisitEvidence): Promise<CookieObservation[]> {
  const topLevelSite = originOf(visit.url);
  const thirdPartyDomains = Object.keys(visit.domains).slice(0, MAX_THIRD_PARTY_DOMAINS);

  const queries: chrome.cookies.GetAllDetails[] = [{ domain: visit.site }];
  for (const domain of thirdPartyDomains) {
    queries.push({ domain });
    // Cookies partitioned to this top-level site (CHIPS) are invisible to a plain query.
    if (topLevelSite) queries.push({ domain, partitionKey: { topLevelSite } });
  }

  const results = await Promise.all(queries.map(safeGetAll));
  const seen = new Set<string>();
  const observations: CookieObservation[] = [];
  for (const cookie of results.flat()) {
    const key = `${cookie.name}|${cookie.domain}|${cookie.path}|${cookie.partitionKey?.topLevelSite ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    observations.push(toObservation(cookie, visit.site));
  }
  return observations;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
