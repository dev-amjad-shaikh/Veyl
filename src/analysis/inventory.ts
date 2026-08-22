/**
 * Turns raw visit evidence into the shape both the risk engine and the
 * explanation layer need: who was contacted, what they are, and what the
 * cookies and browser storage on this site amount to.
 *
 * Everything here is derived. Nothing is invented: a domain with no knowledge
 * entry stays "unknown" all the way to the interface.
 */
import type {
  ApiSignal,
  Category,
  CookieObservation,
  DataType,
  DomainObservation,
  Organization,
  Provenance,
  Site,
  TrackerEntry,
  VisitEvidence,
} from '../domain/types';
import { entryById, identifyCookie, isFunctional, organizationById } from '../knowledge/graph';

export interface ServiceSighting {
  key: string;
  /** The domain shown to the user; `domains` holds every one it was seen on. */
  domain: Site;
  domains: Site[];
  entry: TrackerEntry | null;
  name: string;
  category: Category;
  summary: string;
  organization: Organization | null;
  parentOrganization: Organization | null;
  requests: number;
  blocked: number;
  beforeConsent: boolean;
  functional: boolean;
  known: boolean;
}

export interface CookieInventory {
  all: CookieObservation[];
  thirdParty: CookieObservation[];
  identifiers: CookieObservation[];
  /** Cookies attributable to a tracking (non-functional) service. */
  tracking: { cookie: CookieObservation; service: string; summary: string; category: Category }[];
  functionalNames: Set<string>;
  longestLifetimeDays: number;
}

export interface Inventory {
  site: Site;
  services: ServiceSighting[];
  tracking: ServiceSighting[];
  functional: ServiceSighting[];
  unknown: ServiceSighting[];
  advertising: ServiceSighting[];
  sessionReplay: ServiceSighting[];
  profiling: ServiceSighting[];
  /** Distinct companies, keyed by ultimate parent where one is known. */
  companies: Map<string, { organization: Organization | null; label: string; services: ServiceSighting[] }>;
  cookies: CookieInventory;
  signals: ApiSignal[];
  fingerprintSignals: ApiSignal[];
  storageIdentifierKeys: string[];
  blockedTotal: number;
  preConsentTrackers: ServiceSighting[];
}

const FINGERPRINT_SIGNALS = new Set([
  'canvas-readback',
  'webgl-parameters',
  'audio-fingerprint',
  'font-enumeration',
  'device-enumeration',
  'hardware-profile',
  'battery',
]);

function sightingsFor(observation: DomainObservation): ServiceSighting[] {
  const base = {
    domain: observation.domain,
    requests: observation.requests,
    blocked: observation.blocked,
    beforeConsent: observation.beforeConsent,
  };

  if (observation.serviceIds.length === 0) {
    return [
      {
        ...base,
        key: observation.domain,
        domains: [observation.domain],
        entry: null,
        name: observation.domain,
        category: 'unknown' as Category,
        summary: 'Veyl does not recognise this domain, so it cannot say what it is for.',
        organization: null,
        parentOrganization: null,
        functional: false,
        known: false,
      },
    ];
  }

  return observation.serviceIds.flatMap((id) => {
    const entry = entryById(id);
    if (!entry) return [];
    const organization = organizationById(entry.org);
    const parent = organization?.parent ? organizationById(organization.parent) : null;
    return [
      {
        ...base,
        key: entry.id,
        domains: [observation.domain],
        entry,
        name: entry.name,
        category: entry.category,
        summary: entry.summary,
        organization,
        parentOrganization: parent,
        functional: isFunctional(entry.category),
        known: true,
      },
    ];
  });
}

function buildCookieInventory(visit: VisitEvidence): CookieInventory {
  const all = visit.cookies;
  const tracking: CookieInventory['tracking'] = [];
  const functionalNames = new Set<string>();
  let longestLifetimeDays = 0;

  for (const cookie of all) {
    if (cookie.lifetimeDays && cookie.lifetimeDays > longestLifetimeDays) {
      longestLifetimeDays = cookie.lifetimeDays;
    }
    const known = identifyCookie(cookie.name);
    if (!known) continue;
    if (isFunctional(known.category)) {
      functionalNames.add(cookie.name);
      continue;
    }
    tracking.push({
      cookie,
      service: known.service,
      summary: known.summary,
      category: known.category,
    });
  }

  return {
    all,
    thirdParty: all.filter((c) => c.thirdParty),
    identifiers: all.filter((c) => c.looksLikeIdentifier),
    tracking,
    functionalNames,
    longestLifetimeDays,
  };
}

/**
 * One service, one row. Meta reaches you through facebook.net and facebook.com;
 * listing "Meta Pixel" twice would make the page look worse than it is and
 * would make the tracker count wrong.
 */
function mergeByService(sightings: ServiceSighting[]): ServiceSighting[] {
  const merged = new Map<string, ServiceSighting>();
  for (const sighting of sightings) {
    const existing = merged.get(sighting.key);
    if (!existing) {
      merged.set(sighting.key, { ...sighting });
      continue;
    }
    existing.requests += sighting.requests;
    existing.blocked += sighting.blocked;
    existing.beforeConsent ||= sighting.beforeConsent;
    for (const domain of sighting.domains) {
      if (!existing.domains.includes(domain)) existing.domains.push(domain);
    }
  }
  return [...merged.values()];
}

export function buildInventory(visit: VisitEvidence): Inventory {
  const services = mergeByService(Object.values(visit.domains).flatMap(sightingsFor));
  services.sort((a, b) => b.requests - a.requests);

  const tracking = services.filter((s) => !s.functional && s.known);
  const unknown = services.filter((s) => !s.known);
  const functional = services.filter((s) => s.functional);

  const companies = new Map<string, { organization: Organization | null; label: string; services: ServiceSighting[] }>();
  for (const sighting of services) {
    if (sighting.functional) continue;
    const organization = sighting.parentOrganization ?? sighting.organization;
    const key = organization?.id ?? sighting.domain;
    const label = organization?.name ?? sighting.domain;
    const bucket = companies.get(key) ?? { organization: organization ?? null, label, services: [] };
    bucket.services.push(sighting);
    companies.set(key, bucket);
  }

  const signals = visit.signals;

  return {
    site: visit.site,
    services,
    tracking,
    functional,
    unknown,
    advertising: tracking.filter((s) => s.category === 'advertising'),
    sessionReplay: tracking.filter((s) => s.category === 'session-replay'),
    profiling: tracking.filter((s) => s.entry?.purposes.includes('behavioral-profiling') ?? false),
    companies,
    cookies: buildCookieInventory(visit),
    signals,
    fingerprintSignals: signals.filter((s) => FINGERPRINT_SIGNALS.has(s.kind)),
    storageIdentifierKeys: visit.storage.flatMap((s) => s.identifierKeys),
    blockedTotal: Object.values(visit.domains).reduce((sum, d) => sum + d.blocked, 0),
    preConsentTrackers: tracking.filter((s) => s.beforeConsent),
  };
}

/**
 * What the observed services, taken together, could learn.
 *
 * A capability that comes from knowing what a service is for is *inferred*;
 * one that comes from watching something happen is *observed*. The interface
 * shows the difference rather than flattening both into "they know".
 */
export function observedDataTypes(
  inventory: Inventory
): Map<DataType, { because: string; provenance: Provenance }> {
  const out = new Map<DataType, { because: string; provenance: Provenance }>();
  const note = (type: DataType, because: string, provenance: Provenance) => {
    const existing = out.get(type);
    if (existing && !(existing.provenance !== 'observed' && provenance === 'observed')) return;
    out.set(type, { because, provenance });
  };

  // Attribute each capability to every service that has it, so the reason reads
  // "Google Analytics, Meta Pixel and 2 others" rather than repeating one name.
  const sources = new Map<DataType, string[]>();
  for (const sighting of inventory.tracking) {
    for (const type of sighting.entry?.dataTypes ?? []) {
      sources.set(type, [...(sources.get(type) ?? []), sighting.name]);
    }
  }
  for (const [type, contributors] of sources) {
    const shown = contributors.slice(0, 2).join(' and ');
    const rest = contributors.length - 2;
    note(
      type,
      rest > 0
        ? `${shown} and ${rest} other service${rest === 1 ? '' : 's'} collect this`
        : `${shown} collect${contributors.length === 1 ? 's' : ''} this`,
      'inferred'
    );
  }
  if (inventory.cookies.identifiers.length > 0) {
    note(
      'persistent-id',
      `${inventory.cookies.identifiers.length} cookies here hold what looks like a unique identifier`,
      'observed'
    );
  }
  if (inventory.storageIdentifierKeys.length > 0) {
    note('persistent-id', 'an identifier is stored in this site’s local storage', 'observed');
  }
  if (inventory.fingerprintSignals.length > 0) {
    note('browser-fingerprint', 'scripts on this page read device characteristics used for fingerprinting', 'observed');
  }
  return out;
}
