/**
 * "What they say" against "what they do".
 *
 * The rules here are intentionally cautious. Veyl reports a discrepancy only
 * when the policy makes a positive commitment that the observed behaviour
 * contradicts. Where the law distinguishes selling, sharing and targeted
 * advertising, so does this file — the product never says "they sell your data"
 * on the strength of a network request.
 */
import type { ConsistencyFinding, PolicyAnalysis } from '../domain/types';
import type { Inventory } from './inventory';

export function compare(inventory: Inventory, policy: PolicyAnalysis | null): ConsistencyFinding[] {
  if (!policy || policy.status !== 'ok') return [];
  const findings: ConsistencyFinding[] = [];

  const ads = inventory.advertising;
  const preConsent = inventory.preConsentTrackers;
  const companies = [...inventory.companies.values()];

  const necessaryOnly = policy.claims.find(
    (c) => c.topic === 'consent' && c.assertion.startsWith('Says only necessary cookies')
  );
  if (necessaryOnly) {
    if (preConsent.length > 0) {
      findings.push({
        severity: 'discrepancy',
        topic: 'consent',
        says: necessaryOnly.quote,
        saysIsQuote: true,
        observed: `${preConsent.length} marketing or analytics service${preConsent.length === 1 ? ' was' : 's were'} contacted before you made a choice: ${preConsent.map((s) => s.name).join(', ')}.`,
        explanation:
          'The policy limits pre-consent activity to what is strictly necessary, but your browser had already reached these services.',
      });
    } else {
      findings.push({
        severity: 'aligned',
        topic: 'consent',
        says: necessaryOnly.quote,
        saysIsQuote: true,
        observed: 'No tracking service was contacted before you made a cookie choice.',
        explanation: 'The site behaved the way its policy describes.',
      });
    }
  }

  if (policy.sharesForAdvertising !== 'unstated' && ads.length > 0) {
    const adCompanies = uniqueCompanyNames(ads);
    const quoted = policy.claims.find((c) => c.assertion.includes('advertising partners'))?.quote;
    findings.push({
      severity: 'aligned',
      topic: 'sharing',
      says: quoted ?? 'The policy allows information to be shared with advertising partners.',
      saysIsQuote: quoted !== undefined,
      observed: `Your browser contacted ${adCompanies.length} advertising compan${adCompanies.length === 1 ? 'y' : 'ies'} while this page loaded: ${adCompanies.join(', ')}.`,
      explanation: 'This is the policy working exactly as written — which is the part most people never read.',
    });
  }

  if (policy.sharesForAdvertising === 'unstated' && policy.targetedAdvertising === 'unstated' && ads.length > 0) {
    findings.push({
      severity: 'discrepancy',
      topic: 'sharing',
      says: 'The policy never mentions advertising partners or targeted advertising.',
      saysIsQuote: false,
      observed: `Your browser still contacted ${ads.length} advertising service${ads.length === 1 ? '' : 's'}: ${ads.map((s) => s.name).join(', ')}.`,
      explanation: 'A policy that is silent about advertising does not describe what this page actually does.',
    });
  }

  if (policy.sells === 'no') {
    const brokers = inventory.tracking.filter((s) => s.entry?.purposes.includes('audience-building'));
    if (brokers.length > 0) {
      findings.push({
        severity: 'note',
        topic: 'sale',
        says: policy.claims.find((c) => c.assertion.includes('does not sell'))?.quote ?? 'The policy says it does not sell your personal information.',
        saysIsQuote: policy.claims.some((c) => c.assertion.includes('does not sell')),
        observed: `${brokers.map((s) => s.name).join(', ')} received data here, and their business is building cross-site audience profiles.`,
        explanation:
          'This is not evidence of a sale. Under laws such as the CCPA, sharing data for targeted advertising can count as a "sale" even when no money changes hands — but Veyl cannot see the contract, so it will not call it one.',
      });
    }
  }

  if (policy.sharesWithThirdParties === 'unstated' && companies.length > 2) {
    findings.push({
      severity: 'discrepancy',
      topic: 'sharing',
      says: 'The policy does not say that your data is shared with third parties.',
      saysIsQuote: false,
      observed: `${companies.length} separate companies received a request from your browser on this page.`,
      explanation: 'Loading a third party’s script gives it your IP address, the page you are on, and whatever cookies it holds.',
    });
  }

  if (policy.retention.stance === 'unstated' && inventory.cookies.longestLifetimeDays >= 365) {
    const years = Math.round((inventory.cookies.longestLifetimeDays / 365) * 10) / 10;
    findings.push({
      severity: 'note',
      topic: 'retention',
      says: 'The policy does not say how long data is kept.',
      saysIsQuote: false,
      observed: `A cookie set here does not expire for ${years} years.`,
      explanation: 'The identifier in your browser outlives any commitment the policy makes about it.',
    });
  }

  if (inventory.sessionReplay.length > 0) {
    const mentionsReplay = policy.claims.some((c) => /session|record|replay|heatmap/i.test(c.quote));
    findings.push({
      severity: mentionsReplay ? 'note' : 'discrepancy',
      topic: 'collection',
      says: mentionsReplay
        ? 'The policy refers to recording how you use the site.'
        : 'The policy does not mention recording your session.',
      saysIsQuote: false,
      observed: `${inventory.sessionReplay.map((s) => s.name).join(', ')} can replay your visit as a video, including what you type unless the site excludes those fields.`,
      explanation: 'Session recording captures far more than page views, so it is worth stating plainly.',
    });
  }

  const order: Record<ConsistencyFinding['severity'], number> = { discrepancy: 0, note: 1, aligned: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

function uniqueCompanyNames(services: Inventory['advertising']): string[] {
  const names = new Set<string>();
  for (const service of services) {
    names.add((service.parentOrganization ?? service.organization)?.name ?? service.domain);
  }
  return [...names];
}
