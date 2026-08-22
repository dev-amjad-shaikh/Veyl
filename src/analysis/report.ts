/** Composes evidence, knowledge and judgement into the single object the interface renders. */
import type {
  CookieView,
  PolicyAnalysis,
  ServiceView,
  SiteReport,
  VisitEvidence,
} from '../domain/types';
import type { ProtectionLevel } from '../domain/settings';
import { KNOWLEDGE_VERSION, identifyCookie } from '../knowledge/graph';
import { buildInventory, type Inventory, type ServiceSighting } from './inventory';
import { compare } from './consistency';
import { assessExposure, SIGNAL_LABELS } from './exposure';
import { CATEGORY_LABELS, DATA_TYPE_LABELS } from './labels';

function toServiceView(sighting: ServiceSighting): ServiceView {
  const entry = sighting.entry;

  const observed: string[] = [
    `${sighting.requests} request${sighting.requests === 1 ? '' : 's'} to ${sighting.domains.join(', ')}`,
  ];
  if (sighting.beforeConsent) observed.push('First contacted before you made any cookie choice');
  if (sighting.blocked > 0) observed.push(`${sighting.blocked} request${sighting.blocked === 1 ? '' : 's'} blocked by Veyl`);

  const unknowns: string[] = [];
  if (!sighting.known) {
    unknowns.push('What this domain is for — it is not in Veyl’s knowledge base.');
  } else if (!sighting.functional) {
    unknowns.push('Whether they linked this visit to your identity.');
    unknowns.push('How long they keep what they received.');
  }

  return {
    key: sighting.key,
    name: sighting.name,
    domain: sighting.domain,
    category: sighting.category,
    categoryLabel: CATEGORY_LABELS[sighting.category],
    summary: sighting.summary,
    company: sighting.organization?.name ?? null,
    parentCompany: sighting.parentOrganization?.name ?? null,
    purposes: entry?.purposes ?? [],
    dataTypes: (entry?.dataTypes ?? []).map((type) => ({ type, label: DATA_TYPE_LABELS[type] })),
    requests: sighting.requests,
    blocked: sighting.blocked,
    beforeConsent: sighting.beforeConsent,
    functional: sighting.functional,
    known: sighting.known,
    confidence: entry?.confidence ?? null,
    observed,
    unknowns,
  };
}

function toCookieView(inventory: Inventory): CookieView {
  const named: CookieView['named'] = [];
  const unnamed: CookieView['unnamed'] = [];

  for (const cookie of inventory.cookies.all) {
    const known = identifyCookie(cookie.name);
    if (known) {
      named.push({
        name: cookie.name,
        domain: cookie.domain,
        service: known.service,
        summary: known.summary,
        category: known.category,
        ...(cookie.lifetimeDays !== undefined ? { lifetimeDays: cookie.lifetimeDays } : {}),
        thirdParty: cookie.thirdParty,
      });
    } else {
      unnamed.push({
        name: cookie.name,
        domain: cookie.domain,
        thirdParty: cookie.thirdParty,
        ...(cookie.lifetimeDays !== undefined ? { lifetimeDays: cookie.lifetimeDays } : {}),
        looksLikeIdentifier: cookie.looksLikeIdentifier,
      });
    }
  }
  named.sort((a, b) => (b.lifetimeDays ?? 0) - (a.lifetimeDays ?? 0));
  unnamed.sort((a, b) => Number(b.looksLikeIdentifier) - Number(a.looksLikeIdentifier));

  return {
    total: inventory.cookies.all.length,
    firstParty: inventory.cookies.all.length - inventory.cookies.thirdParty.length,
    thirdParty: inventory.cookies.thirdParty.length,
    identifiers: inventory.cookies.identifiers.length,
    longestLifetimeDays: inventory.cookies.longestLifetimeDays,
    named,
    unnamed,
  };
}

export function buildReport(
  visit: VisitEvidence,
  policy: PolicyAnalysis | null,
  policyPending: boolean,
  protection: { level: ProtectionLevel; inherited: boolean }
): SiteReport {
  const inventory = buildInventory(visit);
  const watching = Object.keys(visit.domains).length > 0 || visit.cookies.length > 0 || visit.signals.length > 0;
  const exposure = assessExposure(visit.site, inventory, policy, watching);

  const blockedServices = inventory.services
    .filter((s) => s.blocked > 0)
    .map((s) => ({ name: s.name, count: s.blocked }))
    .sort((a, b) => b.count - a.count);

  return {
    status: 'ok',
    site: visit.site,
    url: visit.url,
    ...(visit.title ? { title: visit.title } : {}),
    startedAt: visit.startedAt,
    exposure,
    services: inventory.services.map(toServiceView),
    cookies: toCookieView(inventory),
    storage: visit.storage,
    signals: visit.signals.map((s) => ({
      kind: s.kind,
      label: SIGNAL_LABELS[s.kind] ?? s.kind,
      calls: s.calls,
      ...(s.attributedTo ? { attributedTo: s.attributedTo } : {}),
    })),
    policy,
    policyPending,
    consistency: compare(inventory, policy),
    protection: {
      level: protection.level,
      inherited: protection.inherited,
      blocked: inventory.blockedTotal,
      blockedServices,
    },
    knowledgeVersion: KNOWLEDGE_VERSION,
  };
}
