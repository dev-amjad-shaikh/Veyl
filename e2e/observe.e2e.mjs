/**
 * The real journey: a real Chrome, the real built extension, a real page that
 * contacts real tracking companies, and the real popup rendering the result.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { extensionId, launch, serveFixture, stubLanguageModel, waitUntilReady } from './harness.mjs';

const EXTENSION = join(process.cwd(), 'dist-e2e');

test('Veyl explains a real tracking-heavy page end to end', async (t) => {
  const { server, origin: SITE } = await serveFixture();
  const { context, dispose } = await launch(EXTENSION);
  t.after(async () => {
    await context.close();
    server.close();
    await dispose();
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

  // Chrome's on-device model is absent in this build, and Veyl must simply not
  // offer the feature rather than showing a broken panel.
  assert.equal(await popup.locator('.ask__form').count(), 0);

  await popup.screenshot({ path: 'evidence/popup.png', fullPage: true });

  await askVeyl(context, id);
  await keyboardAndScreenReader(popup);
});

/**
 * The report has to be usable without a mouse and legible without colour.
 * Level is carried by a word as well as a hue, and the segment graphic is hidden
 * from assistive technology so it is not read out as meaningless boxes.
 */
async function keyboardAndScreenReader(popup) {
  const first = popup.locator('.dimensions .disclosure__summary').first();
  await first.focus();

  assert.equal(await first.getAttribute('aria-expanded'), 'false');
  await popup.keyboard.press('Enter');
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  await popup.keyboard.press('Enter');
  assert.equal(await first.getAttribute('aria-expanded'), 'false');

  const focusVisible = await popup.evaluate(() => {
    const element = document.querySelector('.dimensions .disclosure__summary');
    element.focus();
    return element.matches(':focus-visible');
  });
  assert.ok(focusVisible, 'keyboard focus must be visible');

  assert.equal(await popup.locator('.segments:not([aria-hidden="true"])').count(), 0);
  for (const text of await popup.locator('.dimensions .pill').allInnerTexts()) {
    assert.match(text.trim(), /^(NONE SEEN|LOW|MEDIUM|HIGH|UNKNOWN)$/, 'level must be a word, not only a colour');
  }

  const level = await popup.locator('.levels .level[aria-pressed="true"]').count();
  assert.equal(level, 1, 'the protection control must expose which level is selected');
  assert.ok(
    (await popup.locator('.levels[role="group"]').count()) === 1,
    'the protection control must be grouped and labelled'
  );
}

/**
 * Exercises the Ask Veyl path with Chrome's model stubbed, and checks the thing
 * that actually matters: the model is handed the evidence digest and nothing
 * else — no URL, no page content.
 */
async function askVeyl(context, id) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 396, height: 900 });
  await page.addInitScript(stubLanguageModel, [
    'Google, Meta and TikTok ',
    'all learn that you looked ',
    'at this page.',
  ]);
  await page.goto(`chrome-extension://${id}/popup/index.html`);
  await page.waitForSelector('.ask__form', { timeout: 15_000 });

  await page.locator('.ask__chip').first().click();
  await page.waitForSelector('.ask__answer', { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('.ask__answer')?.textContent?.includes('this page.'));

  const prompt = await page.evaluate(() => globalThis.__lastPrompt);
  assert.match(prompt, /SITE: shop\.example/);
  assert.match(prompt, /WHAT VEYL CANNOT ESTABLISH/);
  assert.ok(!prompt.includes('/product/42'), 'the page path must not reach the model');
  assert.ok(!/http:\/\/shop\.example:\d+/.test(prompt), 'the page URL must not reach the model');
  assert.match(
    await page.locator('.ask__note').innerText(),
    /decides nothing/,
    'the answer is labelled as phrasing, not as a finding'
  );

  await page.screenshot({ path: 'evidence/ask-veyl.png', fullPage: true });
  await page.close();
}

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
