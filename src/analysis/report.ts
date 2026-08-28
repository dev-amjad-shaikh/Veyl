/** Composes evidence, knowledge and judgement into the single object the interface renders. */
import type {
  CookieView,
  HarvestSummary,
  HarvestView,
  PolicyAnalysis,
  ServiceView,
  SiteReport,
  VisitEvidence,
} from '../domain/types';
import type { ProtectionLevel } from '../domain/settings';
import { KNOWLEDGE_VERSION, entryById, identifyCookie, organizationById } from '../knowledge/graph';
import { HARVESTERS } from '../knowledge/harvest';
import { buildInventory, type Inventory, type ServiceSighting } from './inventory';
import { compare } from './consistency';
import { assessExposure, SIGNAL_LABELS } from './exposure';
import { CATEGORY_LABELS, DATA_TYPE_LABELS, HARVEST_FIELD_LABELS } from './labels';

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

/**
 * What the trackers on this page are set up to read from what a person types.
 *
 * Declared and observed are kept apart deliberately. A pixel can declare fields
 * it never takes, and can take one it never declared, so the two are reported
 * side by side rather than merged into a single confident claim. A tracker that
 * harvests forms but keeps the setting to itself gets a row saying exactly
 * that — "unknown" is the finding, not a gap to be filled in.
 */
function buildHarvest(visit: VisitEvidence, inventory: Inventory): HarvestSummary {
  const views = new Map<string, HarvestView>();

  const viewFor = (entryId: string): HarvestView | null => {
    const existing = views.get(entryId);
    if (existing) return existing;
    const sighting = inventory.services.find((service) => service.entry?.id === entryId);
    const entry = sighting?.entry ?? entryById(entryId);
    if (!entry) return null;
    const view: HarvestView = {
      entryId,
      name: entry.name,
      company: sighting?.organization?.name ?? organizationById(entry.org)?.name ?? null,
      accountId: null,
      declared: [],
      observed: [],
    };
    views.set(entryId, view);
    return view;
  };

  for (const config of visit.harvestConfigs ?? []) {
    const view = viewFor(config.entryId);
    if (!view) continue;
    view.accountId = config.accountId;
    view.declared = config.fields.map((field) => ({ field, label: HARVEST_FIELD_LABELS[field] }));
  }

  for (const transmission of visit.harvestTransmissions ?? []) {
    const view = transmission.entryId ? viewFor(transmission.entryId) : null;
    if (!view) continue;
    view.observed.push({
      field: transmission.field,
      label: HARVEST_FIELD_LABELS[transmission.field],
      parameter: transmission.parameter,
      blocked: transmission.blocked,
    });
  }

  // Silence has two very different causes, and they must not be merged. A
  // tracker Veyl blocked never ran, so it read nothing — that is protection
  // working. A tracker that ran but publishes nothing is simply unknown.
  const blocked: string[] = [];
  const opaque: string[] = [];
  for (const service of inventory.services) {
    const entryId = service.entry?.id;
    if (!entryId || !(entryId in HARVESTERS) || views.has(entryId)) continue;
    (service.blocked > 0 && service.requests === service.blocked ? blocked : opaque).push(service.name);
  }

  return {
    trackers: [...views.values()].sort(
      (a, b) =>
        b.observed.length - a.observed.length ||
        b.declared.length - a.declared.length ||
        a.name.localeCompare(b.name)
    ),
    blocked: blocked.sort(),
    opaque: opaque.sort(),
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
    harvest: buildHarvest(visit, inventory),
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
