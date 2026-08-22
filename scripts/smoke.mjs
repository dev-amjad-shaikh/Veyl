/**
 * Does protection break real websites?
 *
 * Each site is loaded twice in a real Chrome — once with Veyl watching only, once
 * with protection on — and the two renderings are compared. A site that loses most
 * of its text or its images when protection is enabled is broken, and that is the
 * failure this checks for, because it is the one that actually shipped.
 *
 * This talks to the live internet, so it is deliberately not part of `npm test`.
 *
 *   npm run smoke
 *   npm run smoke -- --strict          check the strict level too
 *   npm run smoke -- https://example.com   check one site
 */
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXTENSION = resolve('dist-e2e');

/** A spread of ordinary browsing, weighted towards sites Veyl has a stake in. */
const DEFAULT_SITES = [
  'https://en.wikipedia.org/wiki/Privacy',
  'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies',
  'https://github.com/explore',
  'https://www.bbc.co.uk/news',
  'https://www.theguardian.com/international',
  // Companies that also run trackers: the exact shape that broke in 0.1.0.
  'https://www.reddit.com/r/privacy/',
  'https://www.youtube.com/',
  'https://www.linkedin.com/',
];

const argSites = process.argv.slice(2).filter((a) => a.startsWith('http'));
const SITES = argSites.length > 0 ? argSites : DEFAULT_SITES;
const LEVELS = process.argv.includes('--strict') ? ['off', 'balanced', 'strict'] : ['off', 'balanced'];

async function measure(context, url) {
  const page = await context.newPage();
  const failures = [];
  page.on('requestfailed', (request) => failures.push(request.url()));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3500);
    const shape = await page.evaluate(() => ({
      text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().length,
      images: document.querySelectorAll('img, svg, picture, video').length,
      links: document.querySelectorAll('a[href]').length,
    }));
    return { ...shape, failures: failures.length, error: null };
  } catch (cause) {
    return { text: 0, images: 0, links: 0, failures: failures.length, error: cause.message.split('\n')[0] };
  } finally {
    await page.close().catch(() => {});
  }
}

async function withProtection(level, sites) {
  const profile = await mkdtemp(join(tmpdir(), 'veyl-smoke-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const id = new URL(worker.url()).host;

    // chrome.runtime.sendMessage from the worker does not reach the worker's own
    // listener, so the protocol is driven from one of the extension's pages.
    const control = await context.newPage();
    await control.goto(`chrome-extension://${id}/options/index.html`);
    await control.evaluate(
      (protection) => chrome.runtime.sendMessage({ type: 'update-settings', patch: { protection } }),
      level
    );

    // Registration and rule installation are both asynchronous.
    for (let i = 0; i < 40; i++) {
      const ready = await worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length >= 2);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await control.close();
    const results = {};
    for (const site of sites) results[site] = await measure(context, site);
    return results;
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

const runs = {};
for (const level of LEVELS) {
  process.stdout.write(`loading ${SITES.length} sites with protection "${level}"…\n`);
  runs[level] = await withProtection(level, SITES);
}

const RETAINED = 0.6; // below this share of the unprotected rendering, call it broken.
let broken = 0;

console.log(`\n${'site'.padEnd(46)} ${'level'.padEnd(9)} ${'text'.padStart(7)} ${'kept'.padStart(6)}  verdict`);
console.log('-'.repeat(88));

for (const site of SITES) {
  const base = runs.off[site];
  const label = site.replace(/^https?:\/\//, '').slice(0, 44);
  if (base.error || base.text < 200) {
    console.log(`${label.padEnd(46)} ${'—'.padEnd(9)} ${String(base.text).padStart(7)} ${'—'.padStart(6)}  skipped (unreachable without protection)`);
    continue;
  }
  for (const level of LEVELS.filter((l) => l !== 'off')) {
    const run = runs[level][site];
    const kept = base.text > 0 ? run.text / base.text : 0;
    const imagesKept = base.images > 0 ? run.images / base.images : 1;
    const ok = !run.error && kept >= RETAINED && imagesKept >= 0.3;
    if (!ok) broken += 1;
    console.log(
      `${label.padEnd(46)} ${level.padEnd(9)} ${String(run.text).padStart(7)} ${`${Math.round(kept * 100)}%`.padStart(6)}  ` +
        (ok ? 'ok' : `BROKEN${run.error ? ` — ${run.error}` : ` — ${Math.round(imagesKept * 100)}% of images`}`)
    );
  }
}

console.log('-'.repeat(88));
if (broken > 0) {
  console.error(`\n${broken} site/level combination${broken === 1 ? '' : 's'} lost most of the page with protection on.`);
  process.exit(1);
}
console.log('\nEvery site rendered with protection on.');
