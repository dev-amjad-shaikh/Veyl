/**
 * The trust moment: what a person sees the first time they open Veyl on a site
 * it has no access to. This runs against the *shipped* build, whose manifest
 * requests no host access at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXTENSION = join(process.cwd(), 'dist');

test('the shipped build asks for nothing until you allow a site', async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'veyl-perm-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  t.after(async () => {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const id = new URL(worker.url()).host;

  const granted = await worker.evaluate(() => chrome.permissions.getAll());
  assert.deepEqual(granted.origins, [], 'a freshly installed Veyl can see no website at all');
  assert.ok(!granted.permissions.includes('tabs'), 'Veyl does not ask to read your browsing history');

  const registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  assert.deepEqual(registered, [], 'and it injects nothing into any page');

  const page = await context.newPage();
  await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Chrome hides a tab's URL from an extension that has no access to it — which
  // is the point — and it only lends the URL back through `activeTab` when a
  // person clicks the toolbar icon, something no automation can do. So the gate
  // is rendered here against the real component tree with the service worker's
  // reply stubbed at the message boundary.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 396, height: 640 });
  await popup.addInitScript(() => {
    chrome.runtime.sendMessage = async (message) =>
      message.type === 'get-report'
        ? {
            status: 'not-granted',
            url: 'https://example.com/',
            site: 'example.com',
            originPattern: 'https://example.com/*',
            reason: 'Veyl has not been given access to this site yet.',
          }
        : { ok: true };
  });
  await popup.goto(`chrome-extension://${id}/popup/index.html`);
  await popup.waitForSelector('.gate__title', { timeout: 15_000 });

  assert.match(await popup.locator('.gate__title').innerText(), /Analyse example\.com\?/);
  assert.match(await popup.locator('.gate .button--primary').innerText(), /Allow Veyl on example\.com/);
  await popup.screenshot({ path: 'evidence/permission-gate.png', fullPage: true });

  const options = await context.newPage();
  await options.setViewportSize({ width: 900, height: 1600 });
  await options.goto(`chrome-extension://${id}/options/index.html#welcome`);
  await options.waitForSelector('.shell__title');
  await options.waitForTimeout(400);
  await options.screenshot({ path: 'evidence/settings.png', fullPage: true });
});
