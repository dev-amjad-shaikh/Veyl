/**
 * Runs Veyl across real websites and records what it finds.
 *
 * This is how the project's claims get tested against the open web rather than
 * against a fixture: load each site the way a person would, let Veyl watch, and
 * write down the report. Nothing is aggregated on anyone's behalf and no
 * browsing of yours is involved — it is a fresh profile visiting home pages.
 *
 *   npm run build && node scripts/build-e2e.mjs && node scripts/study.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extensionId, launch, waitUntilReady } from '../e2e/harness.mjs';

const EXTENSION = resolve('dist-e2e');
const SETTLE_MS = 7000;
const PER_SITE_TIMEOUT = 45_000;

const SITES = [
  // news
  'https://www.bbc.co.uk/news', 'https://www.theguardian.com/uk', 'https://www.independent.co.uk',
  'https://www.telegraph.co.uk', 'https://www.mirror.co.uk', 'https://news.sky.com',
  'https://www.standard.co.uk', 'https://metro.co.uk', 'https://www.dailymail.co.uk',
  'https://www.express.co.uk', 'https://inews.co.uk', 'https://www.cnn.com',
  'https://edition.cnn.com', 'https://www.reuters.com', 'https://www.forbes.com',
  'https://techcrunch.com', 'https://www.theverge.com', 'https://arstechnica.com',
  // retail
  'https://www.argos.co.uk', 'https://www.johnlewis.com', 'https://www.next.co.uk',
  'https://www.asos.com', 'https://www.marksandspencer.com', 'https://www.currys.co.uk',
  'https://www.boots.com', 'https://www.screwfix.com', 'https://www.ikea.com/gb/en/',
  'https://www.etsy.com', 'https://www.ebay.co.uk',
  // travel and food
  'https://www.booking.com', 'https://www.skyscanner.net', 'https://www.trainline.com',
  'https://www.nationalrail.co.uk', 'https://www.deliveroo.co.uk', 'https://www.justeat.co.uk',
  // services and reference
  'https://www.rightmove.co.uk', 'https://www.autotrader.co.uk', 'https://www.gumtree.com',
  'https://www.indeed.co.uk', 'https://www.moneysavingexpert.com', 'https://www.which.co.uk',
  'https://www.imdb.com', 'https://www.tripadvisor.co.uk', 'https://www.nhs.uk',
  'https://www.gov.uk', 'https://en.wikipedia.org/wiki/Privacy',
];

const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);

const { context, dispose } = await launch(EXTENSION, { hosts: ['example.invalid'] });
const results = [];

try {
  const id = await extensionId(context);
  await waitUntilReady(context);

  // One extension page drives the protocol; the service worker cannot message itself.
  const control = await context.newPage();
  await control.goto(`chrome-extension://${id}/popup/index.html`);

  for (const [index, url] of SITES.entries()) {
    const started = Date.now();
    const page = await context.newPage();
    let record = { url, status: 'failed', error: null };
    try {
      await withTimeout(page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 }), 26_000, null);
      await page.waitForTimeout(SETTLE_MS);
      const tabId = await page.evaluate(() => 0).then(async () => {
        const tabs = await control.evaluate(async (u) => {
          const all = await chrome.tabs.query({});
          return all.filter((t) => t.url && t.url.startsWith('http')).map((t) => ({ id: t.id, url: t.url }));
        });
        return tabs[tabs.length - 1]?.id ?? null;
      });

      // Give the policy fetch a chance to land.
      let report = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        report = await control.evaluate((t) => chrome.runtime.sendMessage({ type: 'get-report', tabId: t }), tabId);
        if (report?.status === 'ok' && !report.policyPending && report.policy) break;
        await new Promise((r) => setTimeout(r, 1500));
      }

      if (report?.status === 'ok') {
        const tracking = report.services.filter((s) => !s.functional);
        record = {
          url,
          site: report.site,
          status: 'ok',
          exposure: report.exposure.overall,
          confidence: report.exposure.confidence,
          trackingServices: tracking.length,
          companies: report.exposure.rightNow.companies,
          advertising: tracking.filter((s) => s.category === 'advertising').length,
          sessionReplay: tracking.filter((s) => s.category === 'session-replay').map((s) => s.name),
          preConsent: tracking.filter((s) => s.beforeConsent).length,
          cookies: report.cookies.total,
          thirdPartyCookies: report.cookies.thirdParty,
          identifierCookies: report.cookies.identifiers,
          longestCookieDays: report.cookies.longestLifetimeDays,
          fingerprintSignals: report.signals.map((s) => s.kind),
          unidentifiedDomains: report.services.filter((s) => !s.known).length,
          policy: report.policy
            ? {
                status: report.policy.status,
                sources: report.policy.sources.map((s) => s.kind),
                words: report.policy.words,
                readingMinutes: report.policy.readingMinutes,
                sells: report.policy.sells,
                sharesForAdvertising: report.policy.sharesForAdvertising,
                targetedAdvertising: report.policy.targetedAdvertising,
                retention: report.policy.retention.stance,
                rights: report.policy.rights,
                cookieCategories: report.policy.cookieCategories,
                claims: report.policy.claims.length,
              }
            : null,
          consistency: report.consistency.map((f) => ({ severity: f.severity, topic: f.topic, says: f.says, observed: f.observed })),
          companiesSeen: report.exposure.recipients.map((r) => r.organization),
        };
      } else {
        record.error = report?.reason ?? 'no report';
      }
    } catch (cause) {
      record.error = String(cause).split('\n')[0].slice(0, 120);
    } finally {
      await page.close().catch(() => {});
    }
    results.push(record);
    const s = record.status === 'ok'
      ? `${String(record.trackingServices).padStart(2)} trackers · ${String(record.companies).padStart(2)} companies · policy ${record.policy?.status ?? '—'}`
      : `failed — ${record.error}`;
    console.log(`  [${String(index + 1).padStart(2)}/${SITES.length}] ${record.site ?? url.replace(/^https?:\/\//, '').slice(0, 28)}`.padEnd(46) + s);
    if (Date.now() - started > PER_SITE_TIMEOUT) console.log('      (slow)');
  }
} finally {
  await context.close();
  await dispose();
}

await mkdir('study', { recursive: true });
await writeFile('study/results.json', JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
console.log(`\nwrote study/results.json — ${results.filter((r) => r.status === 'ok').length}/${results.length} sites measured`);
