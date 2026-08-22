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
  PolicyLink,
  RequestKind,
  Site,
  StorageObservation,
  VisitEvidence,
} from '../domain/types';
import { hostInfo } from '../domain/site';
import { identifyRequest } from '../knowledge/graph';
import { dropVisit, loadVisit, saveVisit } from './store';

const MAX_DOMAINS = 300;
const MAX_HOSTS_PER_DOMAIN = 8;

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
  if (restored) live.set(tabId, restored);
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

export function recordRequest(
  tabId: number,
  url: string,
  resourceType: string,
  timeStamp: number
): void {
  const visit = live.get(tabId);
  if (!visit) return;
  const info = hostInfo(url);
  if (!info || info.site === visit.site) return;
  if (Object.keys(visit.domains).length >= MAX_DOMAINS && !visit.domains[info.site]) return;

  const kind = KIND_BY_RESOURCE_TYPE[resourceType] ?? 'other';
  let observation = visit.domains[info.site];
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
  touch(visit);
}

export function recordBlocked(tabId: number, url: string): void {
  const visit = live.get(tabId);
  if (!visit) return;
  const info = hostInfo(url);
  if (!info) return;
  const observation = visit.domains[info.site];
  if (!observation) return;
  observation.blocked += 1;
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

