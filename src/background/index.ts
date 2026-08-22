/**
 * Veyl's service worker: observe, judge, protect.
 *
 * Observation is deliberately narrow. Veyl reads request URLs and the cookie
 * jar for sites you have granted, never request or response bodies, and hands
 * blocking to Chrome as declarative rules rather than performing it here.
 *
 * There is no network client in this extension apart from fetching a site's own
 * published privacy policy, and that request carries no credentials and goes to
 * the site itself. Veyl has no server.
 */
import type { PolicyAnalysis, Site, SiteReport, UnavailableReport } from '../domain/types';
import type { Message } from '../domain/messages';
import { DEFAULT_SETTINGS, effectiveProtection, type Settings } from '../domain/settings';
import { siteOf } from '../domain/site';
import { buildReport } from '../analysis/report';
import { fetchPolicy, guessPolicyUrls } from '../analysis/policy';
import { collectCookies } from './cookies';
import { applyProtection } from './protection';
import { clearHistory, readTotals, recordVisit } from './history';
import { hasAccessTo, originPatternFor, syncPageScripts } from './permissions';
import { loadSettings, saveSettings } from './store';
import * as badge from './badge';
import * as visits from './visits';

let settings: Settings = DEFAULT_SETTINGS;
const ready = (async () => {
  settings = await loadSettings();
  await applyProtection(settings);
  await syncPageScripts();
})();

/** Policy analyses live in session memory only — nothing about what you read is written to disk. */
const policyCache = new Map<Site, PolicyAnalysis>();
const policyInFlight = new Set<Site>();
const recordedVisits = new Set<string>();

// --- observation ----------------------------------------------------------

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return undefined;
    if (details.type === 'main_frame') {
      visits.startVisit(details.tabId, details.url);
      scheduleBadge(details.tabId);
      return undefined;
    }
    visits.recordRequest(details.tabId, details.url, details.type, details.timeStamp);
    return undefined;
  },
  { urls: ['http://*/*', 'https://*/*'] }
);

// A request Chrome refused on our behalf is how we count what protection did.
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (!details.error.includes('ERR_BLOCKED_BY_CLIENT')) return;
    visits.recordBlocked(details.tabId, details.url);
  },
  { urls: ['http://*/*', 'https://*/*'] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  void finalize(tabId).finally(() => visits.endVisit(tabId));
});

chrome.tabs.onActivated.addListener(({ tabId }) => scheduleBadge(tabId));

// Cookies land after the requests that set them, so let the page settle first.
const badgeTimers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleBadge(tabId: number): void {
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.set(
    tabId,
    setTimeout(() => {
      badgeTimers.delete(tabId);
      void updateBadge(tabId);
    }, 1200)
  );
}

async function updateBadge(tabId: number): Promise<void> {
  const report = await reportFor(tabId, { withCookies: true });
  if (report.status !== 'ok') {
    await badge.clear(tabId);
    return;
  }
  await badge.paint(
    tabId,
    report.exposure.overall,
    report.exposure.rightNow.trackingServices,
    report.protection.blocked
  );
}

// --- report assembly ------------------------------------------------------

async function unavailable(tabId: number): Promise<UnavailableReport> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const url = tab?.url ?? '';
  const pattern = originPatternFor(url);

  if (!pattern) {
    return {
      status: 'unsupported',
      url,
      site: null,
      originPattern: null,
      reason: 'There is no website open in this tab for Veyl to look at.',
    };
  }
  const granted = await hasAccessTo(url);
  return {
    status: granted ? 'reload-needed' : 'not-granted',
    url,
    site: siteOf(url),
    originPattern: pattern,
    reason: granted
      ? 'Veyl can watch this site, but the page loaded before it started. Reload to see this visit.'
      : 'Veyl has not been given access to this site yet.',
  };
}

async function reportFor(
  tabId: number,
  options: { withCookies?: boolean } = {}
): Promise<SiteReport | UnavailableReport> {
  await ready;
  const visit = await visits.get(tabId);
  if (!visit) return unavailable(tabId);
  if (!(await hasAccessTo(visit.url))) return unavailable(tabId);

  if (options.withCookies) {
    visits.recordCookies(tabId, await collectCookies(visit));
  }
  return buildReport(visit, policyCache.get(visit.site) ?? null, policyInFlight.has(visit.site), {
    level: effectiveProtection(settings, visit.site),
    inherited: settings.perSite[visit.site] === undefined,
  });
}

async function finalize(tabId: number): Promise<void> {
  await ready;
  if (!settings.historyEnabled) return;
  const visit = visits.peek(tabId);
  if (!visit || recordedVisits.has(visit.visitId)) return;
  recordedVisits.add(visit.visitId);
  if (recordedVisits.size > 500) recordedVisits.clear();
  const report = await reportFor(tabId, { withCookies: true });
  if (report.status === 'ok') await recordVisit(report);
}

async function readPolicy(tabId: number): Promise<void> {
  await ready;
  if (!settings.policyAnalysis) return;
  const visit = await visits.get(tabId);
  if (!visit || policyCache.has(visit.site) || policyInFlight.has(visit.site)) return;
  if (!(await hasAccessTo(visit.url))) return;

  policyInFlight.add(visit.site);
  try {
    const candidates = [
      ...visit.policyLinks.filter((l) => l.kind === 'privacy').map((l) => l.url),
      ...visit.policyLinks.filter((l) => l.kind === 'cookies').map((l) => l.url),
      ...guessPolicyUrls(visit.url),
    ];
    policyCache.set(visit.site, await fetchPolicy(visit.site, [...new Set(candidates)]));
  } finally {
    policyInFlight.delete(visit.site);
  }
}

// --- messages -------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  void (async () => {
    switch (message.type) {
      case 'page-start': {
        const tabId = sender.tab?.id;
        // A visit already recorded from the network side wins; this only fills
        // the gap where the worker was asleep when the navigation began.
        if (tabId !== undefined && sender.frameId === 0) {
          const existing = visits.peek(tabId);
          if (!existing || existing.url !== message.url) {
            visits.startVisit(tabId, message.url);
            scheduleBadge(tabId);
          }
        }
        sendResponse({ ok: true });
        return;
      }
      case 'page-report': {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          visits.recordPageReport(tabId, message.payload);
          if (message.payload.policyLinks?.length) void readPolicy(tabId);
        }
        sendResponse({ ok: true });
        return;
      }
      case 'get-report': {
        const tabId = message.tabId ?? (await activeTabId());
        if (tabId === null) {
          sendResponse({
            status: 'unsupported',
            url: '',
            site: null,
            originPattern: null,
            reason: 'There is no website open in this tab for Veyl to look at.',
          });
          return;
        }
        void readPolicy(tabId);
        sendResponse(await reportFor(tabId, { withCookies: true }));
        return;
      }
      case 'read-policy': {
        await readPolicy(message.tabId);
        sendResponse(await reportFor(message.tabId));
        return;
      }
      case 'get-settings': {
        await ready;
        sendResponse(settings);
        return;
      }
      case 'update-settings': {
        await ready;
        settings = { ...settings, ...message.patch };
        await saveSettings(settings);
        await applyProtection(settings);
        sendResponse(settings);
        return;
      }
      case 'set-site-protection': {
        await ready;
        const perSite = { ...settings.perSite };
        if (message.level === 'inherit') delete perSite[message.site];
        else perSite[message.site] = message.level;
        settings = { ...settings, perSite };
        await saveSettings(settings);
        await applyProtection(settings);
        sendResponse(settings);
        return;
      }
      case 'get-history': {
        sendResponse(await readTotals());
        return;
      }
      case 'clear-history': {
        sendResponse(await clearHistory());
        return;
      }
      case 'access-changed': {
        await syncPageScripts();
        sendResponse({ ok: true });
        return;
      }
    }
  })();
  return true; // responses are async
});

/**
 * The tab the person is actually looking at.
 *
 * Usually the active tab, but Veyl's own pages can be in front (the settings
 * page, or a report opened in a tab), and a report about the settings page
 * helps nobody. In that case fall back to the most recently used web page.
 */
async function activeTabId(): Promise<number | null> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== undefined && isWebPage(active.url)) return active.id;

  // Chrome hides a tab's url from an extension with no access to it, so an
  // absent url is ambiguous: it could be a site awaiting permission, or one of
  // Veyl's own pages. Opening the popup from the toolbar grants `activeTab`,
  // which makes the real case readable; otherwise prefer the last web page.
  const tabs = (await chrome.tabs.query({})).filter((tab) => isWebPage(tab.url) && tab.id !== undefined);
  tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return tabs[0]?.id ?? active?.id ?? null;
}

function isWebPage(url: string | undefined): boolean {
  return url !== undefined && (url.startsWith('http://') || url.startsWith('https://'));
}


// --- lifecycle ------------------------------------------------------------

chrome.permissions.onAdded.addListener(() => void syncPageScripts());
chrome.permissions.onRemoved.addListener(() => void syncPageScripts());

chrome.runtime.onStartup.addListener(() => {
  void syncPageScripts();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await ready;
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html#welcome') });
  }
});
