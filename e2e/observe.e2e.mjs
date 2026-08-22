/**
 * The real journey: a real Chrome, the real built extension, a real page that
 * contacts real tracking companies, and the real popup rendering the result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXTENSION = join(process.cwd(), 'dist-e2e');

async function serveFixture() {
  const index = await readFile('e2e/fixture/index.html');
  const privacy = await readFile('e2e/fixture/privacy.html');
  const server = createServer((req, res) => {
    const body = req.url?.startsWith('/privacy') ? privacy : index;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function launch(profileDir) {
  return chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      `--host-resolver-rules=MAP shop.example 127.0.0.1`,
    ],
  });
}

/**
 * A freshly installed extension registers its page scripts asynchronously.
 * In normal use that happens long before you browse; in a test it has to be
 * waited for, or the first navigation genuinely is unwatched.
 */
async function waitUntilReady(context) {
  const worker = context.serviceWorkers()[0];
  for (let i = 0; i < 40; i++) {
    const registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    if (registered.length >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('the extension never registered its page scripts');
}

async function extensionId(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  return new URL(worker.url()).host;
}

test('Veyl explains a real tracking-heavy page end to end', async (t) => {
  const { server, port } = await serveFixture();
  const SITE = `http://shop.example:${port}`;
  const profile = await mkdtemp(join(tmpdir(), 'veyl-e2e-'));
  const context = await launch(profile);
  t.after(async () => {
    await context.close();
    server.close();
    await rm(profile, { recursive: true, force: true });
  });

  const id = await extensionId(context);
  await waitUntilReady(context);

  const page = await context.newPage();
  await page.goto(SITE, { waitUntil: 'load' });
  await page.waitForTimeout(4000);

  // The extension's own pages are the only place chrome.runtime.sendMessage
  // reaches the service worker, so drive the protocol from the real popup.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 396, height: 1400 });
  await popup.goto(`chrome-extension://${id}/popup/index.html`);
  await popup.waitForLoadState('domcontentloaded');

  const tabId = await popup.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://shop.example/*' });
    return tab.id;
  });

  const report = await ask(popup, tabId);

  // --- what Veyl observed ------------------------------------------------
  assert.equal(report.status, 'ok');
  assert.equal(report.site, 'shop.example');
  assert.equal(report.exposure.overall, 'high', 'a page loading five ad and replay services is high exposure');

  const names = report.services.map((s) => s.name);
  for (const expected of ['Google Analytics', 'Meta Pixel', 'Hotjar', 'Google Ads & Ad Manager', 'Criteo', 'TikTok Pixel']) {
    assert.ok(names.includes(expected), `expected to identify ${expected}, saw ${names.join(', ')}`);
  }

  const serviceNames = report.services.map((s) => s.name);
  assert.equal(
    new Set(serviceNames).size,
    serviceNames.length,
    'one service should appear once, however many of its domains were contacted'
  );

  const stripe = report.services.find((s) => s.name === 'Stripe');
  assert.ok(stripe, 'Stripe should be identified');
  assert.equal(stripe.functional, true, 'payment services must never be counted as tracking');

  // --- cookies and storage ------------------------------------------------
  const ga = report.cookies.named.find((c) => c.name === '_ga');
  assert.ok(ga, 'the _ga cookie should be named, not just counted');
  // Chrome caps cookie lifetime at 400 days, so a "two year" cookie really lives
  // 400. Veyl reports what the browser actually holds, not what the site asked for.
  assert.ok(ga.lifetimeDays > 380, `expected a long-lived _ga cookie, got ${ga.lifetimeDays} days`);
  assert.ok(report.cookies.identifiers >= 2);
  const local = report.storage.find((s) => s.kind === 'localStorage');
  assert.ok(local.identifierKeys.includes('_hjSessionUser_9921'));
  assert.ok(!local.identifierKeys.includes('theme'), 'a preference is not an identifier');

  // --- fingerprinting -----------------------------------------------------
  const canvas = report.signals.find((s) => s.kind === 'canvas-readback');
  assert.ok(canvas, 'canvas readback after drawing text is the classic fingerprint, and must be seen');
  const fingerprinting = report.exposure.dimensions.find((d) => d.dimension === 'fingerprinting');
  assert.notEqual(fingerprinting.level, 'none-seen');

  // --- protection ---------------------------------------------------------
  assert.ok(report.protection.blocked > 0, 'balanced protection should have blocked advertising requests');
  const blockedNames = report.protection.blockedServices.map((s) => s.name);
  assert.ok(!blockedNames.includes('Stripe'), 'checkout must never be broken');

  // --- provenance ---------------------------------------------------------
  for (const dimension of report.exposure.dimensions) {
    for (const statement of dimension.statements) {
      assert.ok(['observed', 'declared', 'inferred', 'unknown'].includes(statement.provenance));
    }
  }
  assert.ok(!JSON.stringify(report).includes('"score"'), 'no single authoritative-looking number');

  console.log(
    `\n  observed: ${report.exposure.rightNow.trackingServices} tracking services, ` +
      `${report.exposure.rightNow.companies} companies, ${report.cookies.total} cookies, ` +
      `${report.protection.blocked} requests blocked\n`
  );

  // --- the policy, read locally -------------------------------------------
  const withPolicy = await pollFor(popup, tabId, (r) => r.policy?.status === 'ok');
  assert.equal(withPolicy.policy.sells, 'no', 'the policy says it does not sell');
  assert.equal(withPolicy.policy.sharesForAdvertising !== 'unstated', true);
  assert.ok(withPolicy.policy.rights.includes('delete your data'));
  assert.ok(withPolicy.policy.claims.length >= 6, 'the extractor should find the substantive claims');

  // --- say vs do -----------------------------------------------------------
  const discrepancy = withPolicy.consistency.find((f) => f.severity === 'discrepancy');
  assert.ok(discrepancy, 'trackers fired before consent while the policy promised necessary-only');
  assert.equal(discrepancy.topic, 'consent');
  console.log(`  discrepancy: ${discrepancy.observed}\n`);

  // --- the interface a person actually sees --------------------------------
  await popup.reload();
  await popup.waitForSelector('.header__site', { timeout: 15_000 });
  await popup.waitForTimeout(1200);

  assert.equal(await popup.locator('.header__site').innerText(), 'shop.example');
  assert.match(await popup.locator('.header__label').innerText(), /HIGH EXPOSURE/);
  assert.ok((await popup.locator('.prov[data-prov="observed"]').count()) > 0, 'observed claims are labelled');
  assert.ok((await popup.locator('.finding--discrepancy').count()) > 0, 'the discrepancy is shown to the user');

  // Open every disclosure so the evidence trail is visible in the capture.
  await popup.evaluate(() => {
    document.querySelectorAll('.disclosure__summary').forEach((b) => b.click());
  });
  await popup.waitForTimeout(400);
  await popup.screenshot({ path: 'evidence/popup-full.png', fullPage: true });

  await popup.reload();
  await popup.waitForSelector('.header__site');
  await popup.waitForTimeout(1000);
  await popup.screenshot({ path: 'evidence/popup.png', fullPage: true });
});

function ask(page, tabId) {
  return page.evaluate((id) => chrome.runtime.sendMessage({ type: 'get-report', tabId: id }), tabId);
}

async function pollFor(page, tabId, predicate, attempts = 20) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await ask(page, tabId);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return last;
}
