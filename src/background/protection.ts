/**
 * The protection engine.
 *
 * Blocking is expressed as declarativeNetRequest rules, which means Chrome
 * enforces them without Veyl ever seeing the contents of a request. The rules
 * are generated from the same knowledge graph the explanations come from, so
 * what we block is always something we can name.
 *
 * Two promises are structural, not aspirational:
 *   - Nothing categorised as sign-in, payment, bot protection, consent or CDN
 *     is ever blocked, at any level. blockableDomains() cannot return them.
 *   - Turning protection off for a site takes effect immediately and completely.
 */
import type { Category } from '../domain/types';
import type { ProtectionLevel, Settings } from '../domain/settings';
import { blockableDomains, blockableUrlFilters } from '../knowledge/graph';

const RULE_BALANCED = 1;
const RULE_STRICT = 2;
const RULE_PARAMS = 3;
const RULE_GPC = 4;
/** One rule per tracking endpoint that has to be matched by path rather than domain. */
const RULE_ENDPOINT_BASE = 100;
const ALL_RULE_IDS = [
  RULE_BALANCED,
  RULE_STRICT,
  RULE_PARAMS,
  RULE_GPC,
  ...Array.from({ length: 50 }, (_, i) => RULE_ENDPOINT_BASE + i),
];

/** Blocked at "balanced" and above: tracking whose only purpose is to follow you. */
const BALANCED_CATEGORIES: Category[] = ['advertising', 'session-replay'];
/** Additionally blocked at "strict". */
const STRICT_CATEGORIES: Category[] = [
  'analytics',
  'tag-manager',
  'social',
  'personalization',
  'customer-engagement',
];

/** Campaign identifiers that exist only to tie a click back to you. */
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'gbraid', 'wbraid', 'dclid', 'gclsrc',
  'fbclid', 'igshid', 'ttclid', 'twclid', 'msclkid', 'li_fat_id',
  'mc_eid', 'mc_cid', '_hsenc', '_hsmi', 'vero_id', 'yclid', 'wickedid',
  'epik', 'irclickid', 'rb_clickid', 's_kwcid', 'oly_enc_id', 'oly_anon_id',
];

function domainsFor(categories: Category[]): string[] {
  return [...new Set(blockableDomains().filter((d) => categories.includes(d.category)).map((d) => d.domain))];
}

function sitesAt(settings: Settings, predicate: (level: ProtectionLevel) => boolean): string[] {
  return Object.entries(settings.perSite)
    .filter(([, level]) => predicate(level))
    .map(([site]) => site);
}

export function buildRules(settings: Settings): chrome.declarativeNetRequest.Rule[] {
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  const global = settings.protection;

  const balancedDomains = domainsFor(BALANCED_CATEGORIES);
  const strictDomains = domainsFor(STRICT_CATEGORIES);

  // Which sites get each tier, expressed as an include- or exclude-list so a
  // single rule covers every site rather than one rule per site.
  const offSites = sitesAt(settings, (l) => l === 'off');
  const balancedOrBetterSites = sitesAt(settings, (l) => l !== 'off');
  const strictSites = sitesAt(settings, (l) => l === 'strict');
  const nonStrictSites = sitesAt(settings, (l) => l !== 'strict');

  const blockAction = { type: 'block' as const };

  // A page's own requests are never blocked, whatever the domain is known for.
  // Without this, visiting a company that also runs a tracker — facebook.com,
  // reddit.com, x.com — blocks that site's own scripts and leaves a blank page.
  const thirdPartyOnly = { domainType: 'thirdParty' as const };

  if (global !== 'off' || balancedOrBetterSites.length > 0) {
    rules.push({
      id: RULE_BALANCED,
      priority: 1,
      action: blockAction,
      condition: {
        ...thirdPartyOnly,
        requestDomains: balancedDomains,
        ...(global === 'off'
          ? { initiatorDomains: balancedOrBetterSites }
          : offSites.length
            ? { excludedInitiatorDomains: offSites }
            : {}),
      },
    });
  }

  // Endpoints on domains that must stay reachable: facebook.com serves the page
  // you came for and the pixel that reports you, and only one of those is blocked.
  if (global !== 'off' || balancedOrBetterSites.length > 0) {
    blockableUrlFilters().forEach(({ filter }, index) => {
      rules.push({
        id: RULE_ENDPOINT_BASE + index,
        priority: 3,
        action: blockAction,
        condition: {
          ...thirdPartyOnly,
          urlFilter: filter,
          ...(global === 'off'
            ? { initiatorDomains: balancedOrBetterSites }
            : offSites.length
              ? { excludedInitiatorDomains: offSites }
              : {}),
        },
      });
    });
  }

  if (global === 'strict' || strictSites.length > 0) {
    rules.push({
      id: RULE_STRICT,
      priority: 1,
      action: blockAction,
      condition: {
        ...thirdPartyOnly,
        requestDomains: strictDomains,
        ...(global === 'strict'
          ? nonStrictSites.length
            ? { excludedInitiatorDomains: nonStrictSites }
            : {}
          : { initiatorDomains: strictSites }),
      },
    });
  }

  if (global !== 'off') {
    rules.push({
      id: RULE_PARAMS,
      priority: 2,
      action: {
        type: 'redirect',
        redirect: { transform: { queryTransform: { removeParams: TRACKING_PARAMS } } },
      },
      condition: {
        resourceTypes: ['main_frame', 'sub_frame'],
        ...(offSites.length ? { excludedInitiatorDomains: offSites } : {}),
      },
    });
  }

  if (settings.globalPrivacyControl) {
    rules.push({
      id: RULE_GPC,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Sec-GPC', operation: 'set', value: '1' }],
      },
      condition: { resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image'] },
    });
  }

  return rules;
}

export async function applyProtection(settings: Settings): Promise<void> {
  const addRules = buildRules(settings);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ALL_RULE_IDS,
    addRules,
  });
}

/** What a level actually does, in the words the interface uses. */
export const PROTECTION_DESCRIPTIONS: Record<ProtectionLevel, { title: string; does: string[]; keeps: string[] }> = {
  off: {
    title: 'Watching only',
    does: ['Veyl explains what happens but changes nothing.'],
    keeps: ['Every part of the site behaves exactly as the site intended.'],
  },
  balanced: {
    title: 'Protected',
    does: [
      'Blocks advertising and ad-measurement services',
      'Blocks session recording',
      'Strips campaign tracking codes from links you open',
      'Sends Global Privacy Control',
    ],
    keeps: [
      'Sign-in, checkout, payments and bot protection are never blocked',
      'The site’s own analytics and its cookie banner keep working',
    ],
  },
  strict: {
    title: 'Strict',
    does: [
      'Everything in Protected',
      'Also blocks analytics, tag managers, social embeds and marketing tools',
    ],
    keeps: [
      'Sign-in, checkout, payments and bot protection are never blocked',
      'Some embedded videos and chat widgets will not load',
    ],
  },
};
