/**
 * Owns the evidence for the page currently open in each tab.
 *
 * A "visit" begins at a top-level navigation and ends when the tab navigates
 * away or closes. Evidence is kept in memory for speed and mirrored into
 * chrome.storage.session so it survives the service worker being suspended.
 */
import type {
  ApiSignal,
  ApiSignalKind,
  CookieObservation,
  DomainObservation,
  HarvestConfig,
  HarvestField,
  HarvestTransmission,
  PolicyLink,
  RequestKind,
  Site,
  StorageObservation,
  VisitEvidence,
} from '../domain/types';
import { hostInfo } from '../domain/site';
import { identifyRequest } from '../knowledge/graph';
import { fieldsInUrl } from '../knowledge/harvest';
import { dropVisit, loadVisit, saveVisit } from './store';

const MAX_DOMAINS = 300;
const MAX_HOSTS_PER_DOMAIN = 8;
const MAX_HARVEST_CONFIGS = 8;
const MAX_HARVEST_TRANSMISSIONS = 40;

const live = new Map<number, VisitEvidence>();
const dirty = new Set<number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const pending = [...dirty];
    dirty.clear();
    for (const tabId of pending) {
      const visit = live.get(tabId);
      if (visit) void saveVisit(visit);
    }
  }, 400);
}

function touch(visit: VisitEvidence): void {
  visit.updatedAt = Date.now();
  dirty.add(visit.tabId);
  scheduleFlush();
}

export function startVisit(tabId: number, url: string): VisitEvidence | null {
  const info = hostInfo(url);
  if (!info) return null;
  const visit: VisitEvidence = {
    visitId: `${tabId}-${Date.now()}`,
    tabId,
    site: info.site,
    url,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    consent: { bannerSeen: false, decidedAt: null },
    domains: {},
    cookies: [],
    storage: [],
    signals: [],
    harvestConfigs: [],
    harvestTransmissions: [],
    policyLinks: [],
  };
  live.set(tabId, visit);
  dirty.add(tabId);
  void saveVisit(visit);
  return visit;
}

export function peek(tabId: number): VisitEvidence | undefined {
  return live.get(tabId);
}

/** Reads through to session storage when the worker has been restarted. */
export async function get(tabId: number): Promise<VisitEvidence | null> {
  const inMemory = live.get(tabId);
  if (inMemory) return inMemory;
  const restored = await loadVisit(tabId);
  if (!restored) return null;
  // A visit written by an earlier version has no harvest evidence. Absent is
  // not empty, but an empty list reads as "nothing seen yet", which is true.
  restored.harvestConfigs ??= [];
  restored.harvestTransmissions ??= [];
  live.set(tabId, restored);
  return restored;
}

export function endVisit(tabId: number): void {
  live.delete(tabId);
  dirty.delete(tabId);
  void dropVisit(tabId);
}

const KIND_BY_RESOURCE_TYPE: Record<string, RequestKind> = {
  script: 'script',
  image: 'image',
  imageset: 'image',
  xmlhttprequest: 'xhr',
  sub_frame: 'frame',
  font: 'font',
  stylesheet: 'stylesheet',
  ping: 'ping',
  csp_report: 'ping',
  beacon: 'ping',
};

/** Returns true when this request told us something worth re-rendering for. */
export function recordRequest(
  tabId: number,
  url: string,
  resourceType: string,
  timeStamp: number
): boolean {
  const visit = live.get(tabId);
  if (!visit) return false;
  const info = hostInfo(url);
  if (!info || info.site === visit.site) return false;
  if (Object.keys(visit.domains).length >= MAX_DOMAINS && !visit.domains[info.site]) return false;

  const kind = KIND_BY_RESOURCE_TYPE[resourceType] ?? 'other';
  let observation = visit.domains[info.site];
  const firstSighting = !observation;
  if (!observation) {
    observation = {
      domain: info.site,
      firstSeenAt: timeStamp,
      requests: 0,
      kinds: [],
      hosts: [],
      serviceIds: [],
      setCookie: false,
      beforeConsent: visit.consent.decidedAt === null,
      blocked: 0,
    };
    visit.domains[info.site] = observation;
  }
  observation.requests += 1;
  if (!observation.kinds.includes(kind)) observation.kinds.push(kind);
  if (!observation.hosts.includes(info.hostname) && observation.hosts.length < MAX_HOSTS_PER_DOMAIN) {
    observation.hosts.push(info.hostname);
  }
  const entry = identifyRequest(url, info.hostname);
  if (entry && !observation.serviceIds.includes(entry.id)) observation.serviceIds.push(entry.id);
  const harvested = recordHarvestTransmissions(visit, info.site, entry?.id ?? null, url);
  touch(visit);
  return firstSighting || harvested;
}

/**
 * A request that names personal data in its own parameters is the strongest
 * evidence Veyl can hold: not "this company is known to do X" but "this left
 * your browser, going there, while you were on this page".
 */
function recordHarvestTransmissions(
  visit: VisitEvidence,
  domain: Site,
  entryId: string | null,
  url: string
): boolean {
  let added = false;
  for (const { field, parameter } of fieldsInUrl(url)) {
    const existing = visit.harvestTransmissions.find((t) => t.domain === domain && t.field === field);
    if (existing) continue;
    if (visit.harvestTransmissions.length >= MAX_HARVEST_TRANSMISSIONS) return added;
    visit.harvestTransmissions.push({
      domain,
      ...(entryId ? { entryId } : {}),
      field,
      parameter,
      blocked: false,
      firstSeenAt: Date.now(),
    });
    added = true;
  }
  return added;
}

export function recordBlocked(tabId: number, url: string): void {
  const visit = live.get(tabId);
  if (!visit) return;
  const info = hostInfo(url);
  if (!info) return;
  const observation = visit.domains[info.site];
  if (!observation) return;
  observation.blocked += 1;
  for (const transmission of visit.harvestTransmissions) {
    if (transmission.domain === info.site) transmission.blocked = true;
  }
  touch(visit);
}

export function recordCookies(tabId: number, cookies: CookieObservation[]): void {
  const visit = live.get(tabId);
  if (!visit) return;
  visit.cookies = cookies;
  touch(visit);
}

export function recordPageReport(
  tabId: number,
  report: {
    storage?: StorageObservation[];
    signals?: { kind: ApiSignalKind; calls: number; attributedTo?: string }[];
    harvestConfigs?: { entryId: string; accountId: string; fields: HarvestField[] }[];
    policyLinks?: PolicyLink[];
    consentBannerSeen?: boolean;
    consentDecided?: boolean;
    title?: string;
  }
): void {
  const visit = live.get(tabId);
  if (!visit) return;

  if (report.title) visit.title = report.title;
  if (report.storage) visit.storage = mergeStorage(visit.storage, report.storage);
  if (report.policyLinks) visit.policyLinks = mergePolicyLinks(visit.policyLinks, report.policyLinks);
  if (report.consentBannerSeen) visit.consent.bannerSeen = true;
  if (report.consentDecided && visit.consent.decidedAt === null) visit.consent.decidedAt = Date.now();

  for (const incoming of report.signals ?? []) {
    const existing = visit.signals.find(
      (s) => s.kind === incoming.kind && s.attributedTo === incoming.attributedTo
    );
    if (existing) {
      existing.calls += incoming.calls;
    } else {
      const signal: ApiSignal = {
        kind: incoming.kind,
        calls: incoming.calls,
        firstSeenAt: Date.now(),
      };
      if (incoming.attributedTo) signal.attributedTo = incoming.attributedTo as Site;
      visit.signals.push(signal);
    }
  }

  for (const incoming of report.harvestConfigs ?? []) {
    const existing = visit.harvestConfigs.find(
      (c) => c.entryId === incoming.entryId && c.accountId === incoming.accountId
    );
    // A pixel can be reconfigured mid-visit; the current configuration wins.
    if (existing) existing.fields = incoming.fields;
    else if (visit.harvestConfigs.length < MAX_HARVEST_CONFIGS) {
      visit.harvestConfigs.push({ ...incoming, firstSeenAt: Date.now() });
    }
  }
  touch(visit);
}

function mergeStorage(current: StorageObservation[], incoming: StorageObservation[]): StorageObservation[] {
  const byKind = new Map(current.map((s) => [s.kind, s]));
  for (const observation of incoming) {
    const existing = byKind.get(observation.kind);
    if (!existing || observation.keys > existing.keys) byKind.set(observation.kind, observation);
  }
  return [...byKind.values()];
}

function mergePolicyLinks(current: PolicyLink[], incoming: PolicyLink[]): PolicyLink[] {
  const seen = new Set(current.map((l) => l.url));
  const merged = [...current];
  for (const link of incoming) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    merged.push(link);
  }
  return merged.slice(0, 8);
}

export function liveTabIds(): number[] {
  return [...live.keys()];
}

