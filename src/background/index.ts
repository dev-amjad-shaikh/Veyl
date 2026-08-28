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
import type { Message, PageCuePayload, TabMessage } from '../domain/messages';
import { ALL_SITE_PATTERNS, DEFAULT_SETTINGS, effectiveProtection, type Settings } from '../domain/settings';
import { siteOf } from '../domain/site';
import { buildReport } from '../analysis/report';
import { fetchPolicy, guessPolicyUrls } from '../analysis/policy';
import { collectCookies } from './cookies';
import { applyProtection } from './protection';
import { clearHistory, readTotals, recordVisit } from './history';
import { KNOWLEDGE_VERSION, TRACKER_COUNT } from '../knowledge/graph';
import { DIMENSION_LABELS } from '../analysis/labels';
import { hasAccessTo, originPatternFor, syncPageScripts } from './permissions';
import { loadSettings, saveSettings } from './store';
import * as badge from './badge';
import * as visits from './visits';

let settings: Settings = DEFAULT_SETTINGS;
const ready = (async () => {
  settings = await loadSettings();
  await applyProtection(settings);
  await syncPageScripts();
  // Deliberately NOT openPanelOnActionClick. That setting makes Chrome open the
  // panel *instead of* delivering the action click — and the action click is
  // what grants `activeTab`. Without it Veyl cannot read the address of the tab
  // it is being asked about, so it cannot even name the site to ask permission
  // for. The panel is opened from the click handler below instead.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {
    /* older Chrome; the report is still reachable in a tab */
  });
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
    // A page reveals itself over several seconds, not at the first request. Any
    // request that changes the picture — a company not seen before, or personal
    // data being announced — schedules a fresh look, and the debounce below
    // collapses a burst of them into one.
    if (visits.recordRequest(details.tabId, details.url, details.type, details.timeStamp)) {
      scheduleBadge(details.tabId);
    }
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
  clearTimeout(badgeTimers.get(tabId));
  badgeTimers.delete(tabId);
  badgeDeadlines.delete(tabId);
  void finalize(tabId).finally(() => visits.endVisit(tabId));
});

/**
 * Clicking the toolbar icon opens the panel — and, just as importantly, is what
 * grants `activeTab` for the current page. That grant is how Veyl learns which
 * site it is being asked about before you have given it access to anything.
 *
 * `sidePanel.open` has to be called before any `await`, or Chrome stops
 * counting this as a user gesture and refuses.
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
    /* older Chrome without the side panel: nothing else to open */
  });
  scheduleBadge(tab.id);
});

chrome.tabs.onActivated.addListener(({ tabId }) => scheduleBadge(tabId));

// Late trackers are the norm, so look again once the page says it has finished.
// This also gives a restarted service worker an event to repaint on: its timers
// did not survive being suspended, but this one wakes it.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete') scheduleBadge(tabId);
});

// Cookies land after the requests that set them, so let the page settle first.
// But a page that keeps contacting new companies would keep pushing that settle
// back for as long as it kept going, and an indicator that arrives eventually is
// not an indicator. So the wait is debounced with a ceiling: quiet pages paint
// once, busy pages repaint at a steady beat while they are still busy.
const SETTLE_MS = 900;
const MAX_WAIT_MS = 2200;

const badgeTimers = new Map<number, ReturnType<typeof setTimeout>>();
const badgeDeadlines = new Map<number, number>();

function scheduleBadge(tabId: number): void {
  const now = Date.now();
  const deadline = badgeDeadlines.get(tabId) ?? now + MAX_WAIT_MS;
  badgeDeadlines.set(tabId, deadline);

  clearTimeout(badgeTimers.get(tabId));
  const wait = Math.max(0, Math.min(SETTLE_MS, deadline - now));
  badgeTimers.set(
    tabId,
    setTimeout(() => {
      badgeTimers.delete(tabId);
      badgeDeadlines.delete(tabId);
      void updateBadge(tabId);
    }, wait)
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
  await sendPageCue(tabId, report);
}

/** Sites where someone dismissed the on-page notice. Cleared when Chrome closes. */
const MUTED_KEY = 'mutedSites';

async function mutedSites(): Promise<string[]> {
  const stored = await chrome.storage.session.get(MUTED_KEY);
  return (stored[MUTED_KEY] as string[] | undefined) ?? [];
}

/**
 * Tells the page what, if anything, to draw. Field labels and tracker names
 * cross this boundary and nothing else — no URL, no value, no cookie.
 */
async function sendPageCue(tabId: number, report: SiteReport): Promise<void> {
  if (settings.pageCue === 'never' && !settings.formNotice) return;
  if ((await mutedSites()).includes(report.site)) return;

  const payload: PageCuePayload = {
    level: report.exposure.overall,
    cue: settings.pageCue,
    formNotice: settings.formNotice,
    headline: report.exposure.headline,
    // Naming what drove the level is the difference between a warning and a
    // finding. A page can be high with nothing blocked and no tracker in sight.
    drivers: report.exposure.dimensions
      .filter((dimension) => dimension.level === 'high')
      .map((dimension) => DIMENSION_LABELS[dimension.dimension].toLowerCase()),
    counts: {
      trackers: report.exposure.rightNow.trackingServices,
      companies: report.exposure.rightNow.companies,
      cookies: report.exposure.rightNow.cookies,
      blocked: report.protection.blocked,
    },
    declared: report.harvest.trackers
      .filter((tracker) => tracker.declared.length > 0)
      .map((tracker) => ({ name: tracker.name, fields: tracker.declared.map((f) => f.label) })),
    sent: report.harvest.trackers
      .filter((tracker) => tracker.observed.length > 0)
      .map((tracker) => ({
        name: tracker.name,
        fields: [...new Set(tracker.observed.map((o) => o.label))],
        blocked: tracker.observed.every((o) => o.blocked),
      })),
  };

  const message: TabMessage = { type: 'page-cue', payload };
  await chrome.tabs.sendMessage(tabId, message).catch(() => {
    // No collector in this tab — an extension page, or access not granted.
  });
}

// --- report assembly ------------------------------------------------------

async function unavailable(tabId: number): Promise<UnavailableReport> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const url = tab?.url ?? '';
  const pattern = originPatternFor(url);

  if (!pattern) {
    // An empty address is not an empty tab. It means Chrome has not told Veyl
    // what this page is — which happens when the panel was opened some way
    // other than clicking the Veyl icon, since that click is what grants
    // `activeTab`. Saying "there is no website here" would be a lie, and would
    // leave someone stuck with no way forward.
    const unreadable = tab !== null && url === '';
    return {
      status: 'unsupported',
      url,
      site: null,
      originPattern: unreadable ? ALL_SITE_PATTERNS[0] ?? null : null,
      reason: unreadable
        ? 'Veyl cannot see which site this tab is on. Click the Veyl icon in the toolbar while the page is open, or let Veyl watch every site from Settings.'
        : 'There is no website open in this tab for Veyl to look at.',
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
    const guessed = guessPolicyUrls(visit.url);
    const linked = (kind: 'privacy' | 'cookies') =>
      visit.policyLinks.filter((link) => link.kind === kind).map((link) => link.url);
    const candidates = {
      privacy: [...new Set([...linked('privacy'), ...guessed.privacy])],
      cookies: [...new Set([...linked('cookies'), ...guessed.cookies])],
    };
    policyCache.set(visit.site, await fetchPolicy(visit.site, candidates));
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
          if (message.payload.harvestConfigs?.length) scheduleBadge(tabId);
          if (message.payload.policyLinks?.length) void readPolicy(tabId);
        }
        sendResponse({ ok: true });
        return;
      }
      case 'mute-site': {
        const tabId = sender.tab?.id;
        const visit = tabId === undefined ? null : visits.peek(tabId);
        if (visit) {
          const muted = await mutedSites();
          if (!muted.includes(visit.site)) {
            await chrome.storage.session.set({ [MUTED_KEY]: [...muted, visit.site] });
          }
        }
        sendResponse({ ok: true });
        return;
      }
      case 'open-panel': {
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          await chrome.sidePanel.open({ tabId }).catch(() => {
            /* needs a user gesture Chrome can see; the toolbar icon always works */
          });
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
      case 'get-knowledge': {
        sendResponse({ version: KNOWLEDGE_VERSION, services: TRACKER_COUNT });
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
 * The tab the person is looking at — and never a different one.
 *
 * Veyl once fell back to the most recently used web page when the active tab
 * was not analysable, which meant standing on a new tab or a chrome:// page
 * showed a full report for some other site. In a product whose whole question
 * is "what is *this* site doing", answering about a different site is worse
 * than answering nothing, so there is no fallback: an unanalysable tab is
 * reported as unanalysable.
 *
 * Opening the popup from the toolbar grants `activeTab`, which is what makes a
 * real site's url readable here even before it has been granted.
 */
async function activeTabId(): Promise<number | null> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active?.id ?? null;
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
    return;
  }
  if (details.reason === 'update') {
    // An update leaves every open tab with a content script Chrome has already
    // disconnected, so the page keeps its old visit but Veyl has gone quiet on
    // it. The toolbar can be brought back immediately; the on-page notice
    // genuinely needs a reload, and saying so is better than looking broken.
    const tabs = await chrome.tabs.query({}).catch(() => []);
    for (const tab of tabs) {
      if (tab.id !== undefined) scheduleBadge(tab.id);
    }
  }
});
