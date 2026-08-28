/**
 * Runs in the extension's isolated world. It relays the page probe's signals,
 * inventories browser storage, finds the site's policy links, and watches for
 * a consent banner so Veyl can tell what loaded before you chose.
 *
 * Signals arriving from the page world are untrusted input — a page controls
 * that world. They are validated here before being forwarded.
 */
import type { ApiSignalKind, HarvestField, PolicyLink, StorageObservation } from '../domain/types';
import type { PageCuePayload, PageReportPayload, TabMessage } from '../domain/messages';
import { hideHairline, showCard, showHairline } from './notice';

const EVENT = 'veyl:page-signals';
const HARVEST_EVENT = 'veyl:page-harvest';
const HARVEST_FIELDS = new Set<HarvestField>([
  'email',
  'phone',
  'first-name',
  'last-name',
  'city',
  'state',
  'postcode',
  'gender',
  'date-of-birth',
  'country',
  'site-id',
]);
const SIGNAL_KINDS = new Set<ApiSignalKind>([
  'canvas-readback',
  'webgl-parameters',
  'audio-fingerprint',
  'font-enumeration',
  'device-enumeration',
  'battery',
  'hardware-profile',
  'topics-api',
  'protected-audience',
  'attribution-reporting',
  'storage-access',
]);

const isTopFrame = window.top === window;

function report(payload: PageReportPayload): void {
  try {
    void chrome.runtime.sendMessage({ type: 'page-report', payload });
  } catch {
    // The extension was reloaded or the context is gone. Nothing to recover.
  }
}

// --- signals from the page world -----------------------------------------

window.addEventListener(EVENT, (event) => {
  const detail = (event as CustomEvent).detail;
  if (typeof detail !== 'string' || detail.length > 20_000) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;

  const signals = parsed
    .filter(
      (s): s is { kind: ApiSignalKind; calls: number; attributedTo?: string } =>
        typeof s === 'object' && s !== null &&
        SIGNAL_KINDS.has((s as { kind: ApiSignalKind }).kind) &&
        Number.isFinite((s as { calls: number }).calls)
    )
    .slice(0, 50)
    .map((s) => ({
      kind: s.kind,
      calls: Math.min(10_000, Math.max(1, Math.round(s.calls))),
      ...(typeof s.attributedTo === 'string' && s.attributedTo.length < 100
        ? { attributedTo: s.attributedTo }
        : {}),
    }));

  if (signals.length > 0) report({ signals });
});

// --- form-harvesting configuration from the page world --------------------
//
// Same trust rule as the signals above: the page owns that world, so nothing
// arriving from it is believed until it has been checked into shape here.

window.addEventListener(HARVEST_EVENT, (event) => {
  const detail = (event as CustomEvent).detail;
  if (typeof detail !== 'string' || detail.length > 8000) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;

  const harvestConfigs = parsed
    .filter(
      (c): c is { entryId: string; accountId: string; fields: string[] } =>
        typeof c === 'object' && c !== null &&
        typeof (c as { entryId: unknown }).entryId === 'string' &&
        typeof (c as { accountId: unknown }).accountId === 'string' &&
        Array.isArray((c as { fields: unknown }).fields)
    )
    .slice(0, 8)
    .map((c) => ({
      entryId: c.entryId.slice(0, 40),
      accountId: c.accountId.slice(0, 32),
      fields: c.fields
        .filter((f): f is HarvestField => typeof f === 'string' && HARVEST_FIELDS.has(f as HarvestField))
        .slice(0, 12),
    }))
    .filter((c) => c.fields.length > 0);

  if (harvestConfigs.length > 0) report({ harvestConfigs });
});

if (!isTopFrame) {
  // Sub-frames relay signals only; storage and policy links belong to the page.
} else {
  // Announced at document_start, before the page's own scripts run.
  //
  // This is also what guarantees Veyl is awake at all: a message reliably
  // starts a suspended MV3 service worker, whereas a network event may not.
  // Without it, the first page after a browser restart would go unwatched.
  try {
    // Without the fragment: "#section" is not a different page, and treating it
    // as one would restart the visit and discard what was already observed.
    void chrome.runtime.sendMessage({ type: 'page-start', url: location.href.split('#')[0] });
  } catch {
    /* extension reloaded */
  }

  whenReady(() => {
    report({
      title: document.title.slice(0, 200),
      storage: inventoryStorage(),
      policyLinks: findPolicyLinks(),
    });
    void inventoryIndexedDb();
    watchConsent();
  });
  window.addEventListener('pagehide', () => report({ storage: inventoryStorage() }), { capture: true });
}

// --- what Veyl draws on the page ------------------------------------------
//
// The service worker decides what is true; this decides only when to say it.
// The "before you type" card waits for a form field to be focused, because
// that is the moment the warning is worth anything — and knowing that a field
// received focus is not the same as knowing what goes into it.

let cue: PageCuePayload | null = null;

function fieldFocused(event: Event): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const tag = target.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !target.isContentEditable) return;
  // Not a field anyone types personal data into.
  const type = (target as HTMLInputElement).type;
  if (tag === 'INPUT' && ['checkbox', 'radio', 'submit', 'button', 'hidden', 'range', 'file'].includes(type)) return;
  drawCard();
}

function drawCard(): void {
  if (!cue) return;

  // Something left the page. The rarest finding and the only one worth
  // interrupting for, so it outranks everything else and ignores the threshold.
  const sent = cue.sent[0];
  if (sent && cue.cue !== 'never') {
    const fields = [...new Set(cue.sent.flatMap((s) => s.fields))];
    const names = cue.sent.map((s) => s.name).join(' and ');
    const allBlocked = cue.sent.every((s) => s.blocked);
    showCard(
      `sent:${names}:${fields.join(',')}`,
      {
        tone: allBlocked ? 'ok' : 'warn',
        title: allBlocked
          ? 'Veyl stopped something personal leaving this page'
          : 'Something personal just left this page',
        body: allBlocked
          ? `${names} tried to send your ${list(fields)}. Veyl blocked the request.`
          : `${names} sent your ${list(fields)}.`,
        footnote:
          'Veyl read the name of the parameter that carried it, never what it carried.',
      },
      mute
    );
    return;
  }

  // The level itself, said out loud. A line at the top of the page turned out
  // to be too quiet to register, and the level is the one thing a person wants
  // to know without going and looking for it.
  const wanted = cue.cue === 'medium' ? ['medium', 'high'] : cue.cue === 'high' ? ['high'] : [];
  if (wanted.includes(cue.level)) {
    const { trackers, companies, cookies, blocked } = cue.counts;
    const tally = [
      trackers > 0 ? `${trackers} tracking service${trackers === 1 ? '' : 's'}` : null,
      companies > 0 ? `${companies} compan${companies === 1 ? 'y' : 'ies'} contacted` : null,
      cookies > 0 ? `${cookies} cookie${cookies === 1 ? '' : 's'}` : null,
      blocked > 0 ? `${blocked} blocked by Veyl` : null,
    ].filter(Boolean) as string[];

    showCard(
      `level:${cue.level}`,
      {
        tone: 'warn',
        title: `${cue.level === 'high' ? 'High' : 'Medium'} exposure on this site`,
        body: cue.headline,
        // Naming what drove it is what makes this a finding rather than a scare.
        fields: cue.drivers,
        footnote: tally.join(' · '),
      },
      mute
    );
    return;
  }

  const declared = cue.declared[0];
  if (declared && cue.formNotice) {
    showCard(
      `declared:${declared.name}`,
      {
        tone: 'warn',
        title: 'This page is set up to read what you type',
        body: `${declared.name} is configured to collect these from any form here:`,
        fields: declared.fields,
        footnote: "Read from the tracker's own configuration, not from this site's privacy policy.",
      },
      mute
    );
  }
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function mute(): void {
  try {
    void chrome.runtime.sendMessage({ type: 'mute-site' });
  } catch {
    /* extension reloaded */
  }
}

if (isTopFrame) {
  chrome.runtime.onMessage.addListener((message: TabMessage) => {
    if (message?.type !== 'page-cue') return;
    cue = message.payload;

    const wanted =
      cue.cue === 'medium'
        ? ['medium', 'high']
        : cue.cue === 'high'
          ? ['high']
          : [];
    // The line stays as the quiet version, for after the card is closed.
    if (wanted.includes(cue.level)) showHairline(cue.level);
    else hideHairline();

    // Neither the level nor something already sent waits for a field to be
    // focused; only the "before you type" warning does.
    if (cue.sent.length > 0 || wanted.includes(cue.level)) drawCard();
  });

  document.addEventListener('focusin', fieldFocused, { capture: true, passive: true });
}

function whenReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

// --- browser storage ------------------------------------------------------

function looksLikeIdentifier(value: string): boolean {
  if (value.length < 10 || value.length > 512) return false;
  if (new Set(value).size < 6) return false;
  return (
    /^[0-9a-f]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
    /^[A-Za-z0-9_-]{16,}={0,2}$/.test(value)
  );
}

function inventoryOne(kind: 'localStorage' | 'sessionStorage'): StorageObservation | null {
  try {
    const store = window[kind];
    const identifierKeys: string[] = [];
    for (let i = 0; i < store.length && i < 300; i++) {
      const key = store.key(i);
      if (!key) continue;
      const value = store.getItem(key) ?? '';
      if (looksLikeIdentifier(value) && identifierKeys.length < 25) identifierKeys.push(key);
    }
    return { kind, keys: store.length, identifierKeys };
  } catch {
    return null; // storage blocked for this origin
  }
}

function inventoryStorage(): StorageObservation[] {
  return [inventoryOne('localStorage'), inventoryOne('sessionStorage')].filter(
    (s): s is StorageObservation => s !== null
  );
}

async function inventoryIndexedDb(): Promise<void> {
  try {
    const databases = await indexedDB.databases();
    if (databases.length === 0) return;
    report({
      storage: [
        {
          kind: 'indexedDB',
          keys: databases.length,
          identifierKeys: databases.map((d) => d.name ?? '').filter(Boolean).slice(0, 10),
        },
      ],
    });
  } catch {
    /* not supported or blocked */
  }
}

// --- policy links ---------------------------------------------------------

const POLICY_MATCHERS: { kind: PolicyLink['kind']; re: RegExp }[] = [
  { kind: 'do-not-sell', re: /do not sell|do-not-sell|your privacy choices|opt.?out/i },
  { kind: 'cookies', re: /cookie/i },
  { kind: 'privacy', re: /privacy|datenschutz|confidentialit|privacidad|gizlilik/i },
  { kind: 'terms', re: /terms|conditions/i },
];

/**
 * "Privacy policy" is the document; "privacy settings" is a preferences screen
 * that reads as a policy link and contains none of the text. Sorting the strong
 * wording first means the service worker tries the real document before the hub.
 */
const STRONG_POLICY = /\b(privacy|cookie)\s*(policy|notice|statement)\b/i;
const WEAK_POLICY = /\b(settings|preferences|choices|centre|center|hub|dashboard|manage)\b/i;

function linkStrength(link: PolicyLink): number {
  if (STRONG_POLICY.test(link.label) || STRONG_POLICY.test(link.url)) return 0;
  if (WEAK_POLICY.test(link.label)) return 2;
  return 1;
}

function findPolicyLinks(): PolicyLink[] {
  const found = new Map<string, PolicyLink>();
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href]');
  for (const anchor of anchors) {
    const label = (anchor.textContent ?? '').trim().slice(0, 80);
    const href = anchor.href;
    if (!href.startsWith('http')) continue;
    const haystack = `${label} ${anchor.getAttribute('href') ?? ''}`;
    for (const { kind, re } of POLICY_MATCHERS) {
      if (!re.test(haystack)) continue;
      if (!found.has(href)) found.set(href, { url: href, label: label || kind, kind });
      break;
    }
  }
  const order: Record<PolicyLink['kind'], number> = { privacy: 0, cookies: 1, 'do-not-sell': 2, terms: 3 };
  return [...found.values()]
    .sort((a, b) => order[a.kind] - order[b.kind] || linkStrength(a) - linkStrength(b))
    .slice(0, 8);
}

// --- consent banner -------------------------------------------------------

const CMP_SELECTORS = [
  '#onetrust-banner-sdk',
  '#CybotCookiebotDialog',
  '#usercentrics-root',
  '.qc-cmp2-container',
  '#truste-consent-track',
  '[id*="sp_message_container"]',
  '#didomi-notice',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[id*="cookie-banner"]',
  '[id*="cookieConsent"]',
];

const DECISION_TEXT = /\b(accept|agree|allow|reject|decline|deny|save|confirm|got it|ok)\b/i;

function findBanner(): Element | null {
  for (const selector of CMP_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function watchConsent(): void {
  let banner = findBanner();
  let announced = false;
  let decided = false;

  const announce = () => {
    if (announced) return;
    announced = true;
    report({ consentBannerSeen: true });
  };

  const decide = () => {
    if (decided) return;
    decided = true;
    report({ consentDecided: true });
    observer.disconnect();
  };

  if (banner) announce();

  document.addEventListener(
    'click',
    (event) => {
      if (!banner) return;
      const target = event.target as Element | null;
      if (!target || !banner.contains(target)) return;
      if (DECISION_TEXT.test(target.textContent ?? '')) decide();
    },
    { capture: true }
  );

  const observer = new MutationObserver(() => {
    if (!banner) {
      banner = findBanner();
      if (banner) announce();
      return;
    }
    if (!banner.isConnected || !isVisible(banner)) decide();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // A banner nobody ever answers should not hold the whole assessment hostage.
  setTimeout(() => observer.disconnect(), 60_000);
}

function isVisible(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
