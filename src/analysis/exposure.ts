/**
 * The exposure engine.
 *
 * It reports levels, not a score. A number like "62/100" reads as authoritative
 * and hides how much of the picture we actually saw, so Veyl reports a level per
 * dimension, the provenance of every statement behind it, and how confident it
 * is overall.
 *
 * Two distinctions carry most of the honesty in this product:
 *   "none seen" is not "none" — Veyl watched and saw nothing.
 *   "unknown"   is not "low"  — Veyl could not look.
 */
import type {
  Confidence,
  DataType,
  Dimension,
  ExposureDimension,
  ExposureLevel,
  PolicyAnalysis,
  PrivacyExposure,
  Provenance,
  Site,
  Statement,
} from '../domain/types';
import type { Inventory } from './inventory';
import { observedDataTypes } from './inventory';
import { DATA_TYPE_LABELS } from './labels';

export const SIGNAL_LABELS: Record<string, string> = {
  'canvas-readback': 'Drew hidden graphics and read the pixels back — the classic fingerprinting technique',
  'webgl-parameters': 'Read your graphics card make and model',
  'audio-fingerprint': 'Measured how your device processes audio',
  'font-enumeration': 'Checked which fonts you have installed',
  'device-enumeration': 'Listed your cameras and microphones',
  'hardware-profile': 'Read your processor and memory profile',
  battery: 'Read your battery level',
  'topics-api': 'Asked Chrome for your advertising interest topics',
  'protected-audience': 'Added you to an ad-retargeting audience inside your own browser',
  'attribution-reporting': 'Registered advertising attribution measurement',
  'storage-access': 'Requested access to its own cross-site storage',
};

/**
 * Weighted by how much each signal actually distinguishes.
 *
 * Measured across 42 real sites: a processor and memory read fires on 48% of
 * them and a battery read on 33%, because ordinary code — video players sizing
 * worker pools, layout libraries — reads those too. A signal present on half the
 * web is not evidence of fingerprinting, so on its own neither can push this
 * dimension past "low". Drawing hidden text and reading the pixels back has no
 * such innocent explanation, and is weighted accordingly.
 */
const FINGERPRINT_WEIGHT: Record<string, number> = {
  'canvas-readback': 35,
  'audio-fingerprint': 30,
  'font-enumeration': 25,
  'webgl-parameters': 18,
  'device-enumeration': 12,
  'hardware-profile': 8,
  battery: 8,
};

/** Internal only. The number is a means of ordering evidence, never a product claim. */
function levelFrom(weight: number): ExposureLevel {
  if (weight <= 5) return 'none-seen';
  if (weight < 30) return 'low';
  if (weight < 60) return 'medium';
  return 'high';
}

const LEVEL_ORDER: Record<ExposureLevel, number> = {
  unknown: -1,
  'none-seen': 0,
  low: 1,
  medium: 2,
  high: 3,
};

function worst(levels: ExposureLevel[]): ExposureLevel {
  let result: ExposureLevel = 'unknown';
  for (const level of levels) {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[result]) result = level;
  }
  return result;
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function lowest(values: Confidence[]): Confidence {
  return values.reduce((a, b) => (CONFIDENCE_ORDER[b] < CONFIDENCE_ORDER[a] ? b : a), 'high');
}

function say(text: string, provenance: Provenance, evidence: string[] = []): Statement {
  return { text, provenance, evidence };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Agreement for a verb following a counted noun. */
function verb(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function names(services: { name: string }[], limit = 5): string {
  const shown = services.slice(0, limit).map((s) => s.name);
  return services.length > limit ? `${shown.join(', ')} and ${services.length - limit} more` : shown.join(', ');
}

// --- dimensions -----------------------------------------------------------

function tracking(inventory: Inventory, watching: boolean): ExposureDimension {
  const statements: Statement[] = [];
  let weight = 0;

  if (inventory.tracking.length > 0) {
    weight += Math.min(60, inventory.tracking.length * 12);
    statements.push(
      say(
        `${plural(inventory.tracking.length, 'tracking service')} loaded on this page.`,
        'observed',
        inventory.tracking.map((s) => `${s.name} (${s.domain}) — ${s.requests} request${s.requests === 1 ? '' : 's'}`)
      )
    );
  }

  const identifiers = inventory.cookies.identifiers.filter((c) => c.thirdParty);
  if (identifiers.length > 0) {
    weight += 18;
    statements.push(
      say(
        `${plural(identifiers.length, 'third-party cookie')} ${verb(identifiers.length, 'holds', 'hold')} a value that looks like a unique identifier for you.`,
        'observed',
        identifiers.slice(0, 8).map((c) => `${c.name} set for ${c.domain}`)
      )
    );
  }

  if (inventory.storageIdentifierKeys.length > 0) {
    weight += 10;
    statements.push(
      say(
        'An identifier is kept in this site’s local storage, which survives clearing your cookies.',
        'observed',
        inventory.storageIdentifierKeys.slice(0, 8)
      )
    );
  }

  if (inventory.sessionReplay.length > 0) {
    weight += 20;
    statements.push(
      say(
        `Your visit can be replayed as a recording by ${names(inventory.sessionReplay)}.`,
        'inferred',
        inventory.sessionReplay.map((s) => `${s.name} is a session-recording service — ${s.summary}`)
      )
    );
  }

  if (statements.length === 0) {
    statements.push(say('Veyl saw no tracking service on this page.', 'observed'));
  }

  return {
    dimension: 'tracking',
    level: watching ? levelFrom(weight) : 'unknown',
    provenance: 'observed',
    confidence: watching ? 'high' : 'low',
    statements,
  };
}

function advertising(inventory: Inventory, watching: boolean): ExposureDimension {
  const statements: Statement[] = [];
  const ads = inventory.advertising;
  let weight = 0;

  if (ads.length > 0) {
    weight = 40 + Math.min(45, (ads.length - 1) * 12);
    statements.push(
      say(
        `${plural(ads.length, 'advertising service')} loaded while this page was rendering: ${names(ads)}.`,
        'observed',
        ads.map((s) => `${s.name} (${s.domain}) — ${s.summary}`)
      )
    );
    if (inventory.profiling.length > 0) {
      weight += 15;
      statements.push(
        say(
          `${names(inventory.profiling)} use what you do here to build a behavioural profile.`,
          'inferred',
          inventory.profiling.map((s) => `${s.name}'s stated purpose includes behavioural profiling`)
        )
      );
    }
  } else {
    statements.push(say('Veyl saw no advertising or ad-measurement service on this page.', 'observed'));
  }

  return {
    dimension: 'advertising',
    level: watching ? levelFrom(weight) : 'unknown',
    provenance: 'observed',
    confidence: watching ? 'high' : 'low',
    statements,
  };
}

function crossSite(inventory: Inventory, watching: boolean): ExposureDimension {
  const statements: Statement[] = [];
  const companies = [...inventory.companies.values()];
  let weight = Math.min(70, companies.length * 16);

  if (companies.length > 0) {
    statements.push(
      say(
        `${plural(companies.length, 'company', 'companies')} received a request from your browser on this page.`,
        'observed',
        companies.map((c) => `${c.label} — via ${c.services.map((s) => s.domain).join(', ')}`)
      )
    );
  } else {
    statements.push(say('No third-party company was contacted while this page loaded.', 'observed'));
  }

  const resolvers = inventory.tracking.filter((s) => s.entry?.purposes.includes('audience-building'));
  if (resolvers.length > 0) {
    weight += 15;
    statements.push(
      say(
        `${names(resolvers)} exist to recognise the same person across different websites.`,
        'inferred',
        resolvers.map((s) => `${s.name} — ${s.summary}`)
      )
    );
  }

  const forwarders = inventory.tracking.filter(
    (s) => s.category === 'tag-manager' || (s.entry?.mechanisms?.includes('server-side-forwarding') ?? false)
  );
  if (forwarders.length > 0) {
    weight += 12;
    statements.push(
      say(
        `${names(forwarders)} can pass your activity on to further vendors from the site’s own servers.`,
        'inferred',
        forwarders.map((s) => `${s.name} — ${s.summary}`)
      )
    );
  }

  if (inventory.unknown.length > 3) {
    statements.push(
      say(
        `${plural(inventory.unknown.length, 'domain')} could not be identified, so what they are for is unknown.`,
        'unknown',
        inventory.unknown.map((s) => s.domain).slice(0, 12)
      )
    );
  }

  return {
    dimension: 'crossSite',
    level: watching ? levelFrom(weight) : 'unknown',
    provenance: 'observed',
    confidence: watching ? (inventory.unknown.length > inventory.tracking.length ? 'medium' : 'high') : 'low',
    statements,
  };
}

function fingerprinting(inventory: Inventory, watching: boolean): ExposureDimension {
  const signals = inventory.fingerprintSignals;
  if (!watching) {
    return {
      dimension: 'fingerprinting',
      level: 'unknown',
      provenance: 'unknown',
      confidence: 'low',
      statements: [say('Veyl was not watching this page as it loaded.', 'unknown')],
    };
  }
  if (signals.length === 0) {
    return {
      dimension: 'fingerprinting',
      level: 'none-seen',
      provenance: 'observed',
      // Absence of a signal is weaker evidence than its presence, and the level says so.
      confidence: 'medium',
      statements: [
        say('No fingerprinting signals were seen during this visit.', 'observed'),
        say(
          'That is not the same as proving none happened — code inside a cross-origin frame is outside what Veyl can watch.',
          'unknown'
        ),
      ],
    };
  }

  let weight = 0;
  const statements: Statement[] = [];
  for (const signal of signals) {
    weight += FINGERPRINT_WEIGHT[signal.kind] ?? 10;
    statements.push(
      say(
        `${SIGNAL_LABELS[signal.kind] ?? signal.kind}${signal.attributedTo ? ` — by ${signal.attributedTo}` : ''}.`,
        'observed',
        [`${signal.calls} call${signal.calls === 1 ? '' : 's'} observed`]
      )
    );
  }

  const allFunctional = signals.every((s) => {
    const owner = inventory.services.find((service) => service.domain === s.attributedTo);
    return owner?.functional ?? false;
  });
  if (allFunctional) {
    weight = Math.round(weight * 0.5);
    statements.push(
      say('These calls came from bot-protection or payment code, where device checks are expected.', 'inferred')
    );
  }

  return {
    dimension: 'fingerprinting',
    level: levelFrom(weight),
    provenance: 'observed',
    confidence: 'high',
    statements,
  };
}

function policyTransparency(policy: PolicyAnalysis | null): ExposureDimension {
  if (!policy || policy.status !== 'ok') {
    return {
      dimension: 'policyTransparency',
      level: 'unknown',
      provenance: 'unknown',
      confidence: 'low',
      statements: [
        say(
          policy?.status === 'not-found'
            ? 'Veyl could not find a privacy policy linked from this page.'
            : 'Veyl has not read this site’s privacy policy yet.',
          'unknown'
        ),
      ],
    };
  }
  return {
    dimension: 'policyTransparency',
    level: levelFrom(100 - policy.clarity),
    provenance: 'declared',
    confidence: policy.words > 400 ? 'high' : 'medium',
    statements: policy.clarityNotes.map((note) => say(note, 'declared', policy.url ? [policy.url] : [])),
  };
}

function userControl(inventory: Inventory, policy: PolicyAnalysis | null, watching: boolean): ExposureDimension {
  const statements: Statement[] = [];
  const hasTracking = inventory.tracking.length > 0;
  let weight: number;

  if (!watching) {
    return {
      dimension: 'userControl',
      level: 'unknown',
      provenance: 'unknown',
      confidence: 'low',
      statements: [say('Veyl was not watching this page as it loaded.', 'unknown')],
    };
  }

  if (hasTracking && inventory.preConsentTrackers.length === inventory.tracking.length) {
    weight = 65;
    statements.push(
      say(
        `${plural(inventory.preConsentTrackers.length, 'tracking service')} loaded before you made any cookie choice.`,
        'observed',
        inventory.preConsentTrackers.map((s) => `${s.name} — first contacted before consent`)
      )
    );
  } else if (hasTracking) {
    weight = 35;
    statements.push(say('Tracking is present on this page.', 'observed'));
  } else {
    weight = 5;
    statements.push(say('Nothing on this page needed a privacy choice from you.', 'observed'));
  }

  if (policy?.status === 'ok') {
    if (policy.rights.length > 0) {
      weight -= 20;
      statements.push(
        say(`The policy says you can ${policy.rights.join(', ')}.`, 'declared', policy.url ? [policy.url] : [])
      );
    } else {
      weight += 15;
      statements.push(say('The policy does not describe how to exercise your privacy rights.', 'declared'));
    }
  } else {
    statements.push(say('Whether the site offers you rights over your data is unknown until its policy is read.', 'unknown'));
  }

  return {
    dimension: 'userControl',
    level: levelFrom(Math.max(0, weight)),
    provenance: policy?.status === 'ok' ? 'declared' : 'observed',
    confidence: 'medium',
    statements,
  };
}

function dataRetention(inventory: Inventory, policy: PolicyAnalysis | null, watching: boolean): ExposureDimension {
  const statements: Statement[] = [];
  const days = inventory.cookies.longestLifetimeDays;

  if (!watching || (inventory.cookies.all.length === 0 && !policy)) {
    return {
      dimension: 'dataRetention',
      level: 'unknown',
      provenance: 'unknown',
      confidence: 'low',
      statements: [say('No cookies were seen and no policy has been read.', 'unknown')],
    };
  }

  let weight: number;
  if (days >= 730) weight = 80;
  else if (days >= 365) weight = 60;
  else if (days >= 180) weight = 40;
  else if (days >= 30) weight = 25;
  else weight = 8;

  statements.push(
    days > 0
      ? say(
          `The longest-lived cookie here expires in ${days >= 365 ? `${Math.round((days / 365) * 10) / 10} years` : `${days} days`}.`,
          'observed'
        )
      : say('Every cookie on this page expires when you close the browser.', 'observed')
  );

  if (policy?.status === 'ok') {
    if (policy.retention.stance === 'unstated') {
      weight += 15;
      statements.push(say('The policy does not say how long data is kept.', 'declared'));
    } else if (policy.retention.detail) {
      weight -= 10;
      statements.push(say('The policy states a retention period.', 'declared', [policy.retention.detail]));
    }
  } else {
    statements.push(say('How long the company keeps what it collects is unknown.', 'unknown'));
  }

  return {
    dimension: 'dataRetention',
    level: levelFrom(Math.max(0, weight)),
    provenance: policy?.status === 'ok' ? 'declared' : 'observed',
    confidence: 'medium',
    statements,
  };
}

// --- composition ----------------------------------------------------------

const HEADLINES: Record<ExposureLevel, string> = {
  'none-seen': 'This page kept to itself. Nothing here followed you.',
  low: 'A little measurement, and nothing that follows you between websites.',
  medium: 'This site learns more about you than it needs in order to work.',
  high: 'Your visit is being reported to companies whose business is following people around the web.',
  unknown: 'Veyl has not watched this page yet.',
};

export function assessExposure(
  site: Site,
  inventory: Inventory,
  policy: PolicyAnalysis | null,
  watching: boolean
): PrivacyExposure {
  const dimensions: ExposureDimension[] = [
    tracking(inventory, watching),
    advertising(inventory, watching),
    crossSite(inventory, watching),
    fingerprinting(inventory, watching),
    policyTransparency(policy),
    userControl(inventory, policy, watching),
    dataRetention(inventory, policy, watching),
  ];

  const behaviour: Dimension[] = ['tracking', 'advertising', 'crossSite', 'fingerprinting'];
  const behaviourDimensions = dimensions.filter((d) => behaviour.includes(d.dimension));
  const overall = worst(behaviourDimensions.map((d) => d.level));

  const confidenceReasons: string[] = [];
  let confidence = lowest(behaviourDimensions.map((d) => d.confidence));
  if (!watching) {
    confidenceReasons.push('Veyl was not watching when this page loaded.');
  } else {
    confidenceReasons.push('Veyl watched every request this page made from the moment it started loading.');
  }
  if (inventory.unknown.length > 0) {
    confidenceReasons.push(
      `${plural(inventory.unknown.length, 'domain')} are not in Veyl’s knowledge base, so their purpose is unknown.`
    );
    if (inventory.unknown.length > inventory.tracking.length && confidence === 'high') confidence = 'medium';
  }
  if (!policy || policy.status !== 'ok') {
    confidenceReasons.push('The site’s written policy has not been read, so nothing here is checked against it.');
  }

  const dataTypes = observedDataTypes(inventory);
  const mayKnow = [...dataTypes.entries()].map(([dataType, source]) => ({
    dataType: dataType as DataType,
    label: DATA_TYPE_LABELS[dataType],
    because: source.because,
    provenance: source.provenance,
  }));

  const recipients = [...inventory.companies.values()].map((company) => ({
    organization: company.label,
    ...(company.organization?.parent ? { parent: company.organization.parent } : {}),
    category: company.services[0]?.category ?? ('unknown' as const),
    services: company.services.map((s) => ({
      name: s.name,
      domain: s.domain,
      category: s.category,
      summary: s.summary,
      requests: s.requests,
    })),
    functional: false,
  }));
  recipients.sort((a, b) => b.services.length - a.services.length);

  return {
    site,
    overall,
    headline: HEADLINES[overall],
    confidence,
    confidenceReasons,
    dimensions,
    rightNow: {
      cookies: inventory.cookies.all.length,
      thirdPartyCookies: inventory.cookies.thirdParty.length,
      trackingServices: inventory.tracking.length,
      companies: inventory.companies.size,
      advertisingDetected: inventory.advertising.length > 0,
      sessionReplayDetected: inventory.sessionReplay.length > 0,
      blocked: inventory.blockedTotal,
    },
    mayKnow,
    recipients,
    unknowns: unknowns(inventory, policy),
  };
}

function unknowns(inventory: Inventory, policy: PolicyAnalysis | null): string[] {
  const out: string[] = [];
  if (inventory.tracking.length > 0) {
    out.push('Whether any of these companies connected this visit to your real identity.');
    out.push('What happens to the data once it leaves your browser.');
  }
  if (inventory.tracking.some((s) => s.category === 'tag-manager')) {
    out.push('What the site forwards to other vendors from its own servers, out of the browser’s view.');
  }
  if (!policy || policy.status !== 'ok') {
    out.push('What the site’s written policy permits — Veyl has not read it for this site.');
  } else if (policy.retention.stance === 'unstated') {
    out.push('How long the data is kept — the policy does not say.');
  }
  if (inventory.tracking.length > 0) {
    out.push('Whether your data was legally "sold" — that depends on contracts Veyl cannot see.');
  }
  return out;
}
