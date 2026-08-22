/**
 * Protection must never break the page a person is trying to use.
 *
 * This reproduces the failure that shipped in 0.1.0: a site whose domain is
 * also known for tracking — facebook.com, reddit.com, x.com — had its own
 * scripts and stylesheets blocked, so the HTML arrived and nothing else did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { extensionId, launch, waitUntilReady } from './harness.mjs';

const EXTENSION = join(process.cwd(), 'dist-e2e');

/** taboola.com is on the block list and is not HSTS-preloaded, so it can be served over http. */
const BLOCKED_SITE = 'www.taboola.com';

async function serve() {
  const server = createServer((req, res) => {
    if (req.url.endsWith('.js')) {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end('document.body.dataset.app = "booted";');
      return;
    }
    if (req.url.endsWith('.css')) {
      res.writeHead(200, { 'content-type': 'text/css' });
      res.end('body{color:#333}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<link rel="stylesheet" href="/app.css"><h1 id="ok">the site loaded</h1>
       <script src="/app.js"></script>
       <script src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>`
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('a site whose domain is on the block list still works', async (t) => {
  const { server, port } = await serve();
  const { context, dispose } = await launch(EXTENSION, { hosts: [BLOCKED_SITE] });
  t.after(async () => {
    await context.close();
    server.close();
    await dispose();
  });

  await extensionId(context);
  await waitUntilReady(context);

  const worker = context.serviceWorkers()[0];
  const level = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.protection);
  assert.notEqual(level, 'off', 'this test is meaningless unless protection is on by default');

  const page = await context.newPage();
  const response = await page.goto(`http://${BLOCKED_SITE}:${port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  assert.equal(response.status(), 200);
  assert.equal(await page.locator('#ok').count(), 1, 'the page itself must load');
  assert.equal(
    await page.evaluate(() => document.body.dataset.app),
    'booted',
    'the site’s own script must run — blocking it is what left users with a blank page'
  );
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).color),
    'rgb(51, 51, 51)',
    'the site’s own stylesheet must load'
  );

  // ...while the third-party ad request from that same page is still blocked.
  const blocked = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
        script.onerror = () => resolve(true);
        script.onload = () => resolve(false);
        document.head.appendChild(script);
      })
  );
  assert.equal(blocked, true, 'third-party advertising must still be blocked');
});
