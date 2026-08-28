/**
 * Captures the extension's panels in dark mode for the website.
 *
 * The site sits on a near-black ground, so the product shots are taken with the
 * browser in dark mode — the same interface a person sees, not a recolour of it.
 * Everything comes from the end-to-end fixture, so no real browsing appears.
 *
 *   npm run build && node scripts/build-e2e.mjs && node scripts/site-shots.mjs
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extensionId, launch, serveFixture, stubLanguageModel, waitUntilReady } from '../e2e/harness.mjs';

const OUT = 'site/assets';
const EXTENSION = resolve('dist-e2e');

await mkdir(OUT, { recursive: true });

const { server, origin } = await serveFixture();
const { context, dispose } = await launch(EXTENSION, { deviceScaleFactor: 2, colorScheme: 'dark' });

try {
  const id = await extensionId(context);
  await waitUntilReady(context);

  const site = await context.newPage();
  await site.goto(origin, { waitUntil: 'load' });
  await site.waitForTimeout(4500);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 1200 });
  await popup.addInitScript(stubLanguageModel, [
    'Three advertising companies — Google, Meta and TikTok — were told you looked at this page, ',
    'and Hotjar can replay how you moved around it. ',
    'None of them needed to be here for the page to work.',
  ]);
  await popup.goto(`chrome-extension://${id}/popup/index.html`);
  const tabId = await popup.evaluate(async () => (await chrome.tabs.query({ url: 'http://shop.example/*' }))[0].id);
  await popup.goto(`chrome-extension://${id}/popup/index.html?tab=${tabId}`);
  await popup.waitForSelector('.finding--discrepancy', { timeout: 20_000 });

  await popup.screenshot({ path: `${OUT}/shot-report.png`, clip: { x: 0, y: 0, width: 400, height: 640 } });

  await popup.locator('.section').filter({ has: popup.locator('.harvest') }).first()
    .screenshot({ path: `${OUT}/shot-harvest.png` });

  await popup.locator('.ask__chip').first().click();
  await popup.waitForFunction(() => document.querySelector('.ask__answer')?.textContent?.includes('work.'));
  // The answer fades in and the Ask button is disabled while it streams, so
  // capturing on the last word catches both mid-state.
  await popup.locator('.ask__send:not(:disabled)').waitFor({ timeout: 10_000 }).catch(() => {});
  await popup.waitForTimeout(700);
  await popup.locator('.section', { hasText: 'Ask Veyl' }).screenshot({ path: `${OUT}/shot-ask.png` });

  await popup.locator('.dimensions .disclosure__summary').first().click();
  await popup.locator('.statement__evidence summary').first().click();
  await popup.waitForTimeout(300);
  await popup.locator('.section', { hasText: 'Privacy exposure' }).screenshot({ path: `${OUT}/shot-exposure.png` });

  await popup.locator('.section', { hasText: 'What they say vs what they do' }).screenshot({ path: `${OUT}/shot-compare.png` });
  await popup.locator('.section', { hasText: 'Protection on' }).screenshot({ path: `${OUT}/shot-protection.png` });

  // The corner note, on the fixture page that raised it.
  const noticed = await context.newPage();
  await noticed.setViewportSize({ width: 1100, height: 760 });
  await noticed.goto(origin, { waitUntil: 'load' });
  await noticed.waitForSelector('#veyl-notice[data-veyl-card]', { timeout: 25_000 }).catch(() => {});
  await noticed.waitForTimeout(900);
  // The card is in a closed shadow root, so its box comes from the renderer
  // rather than a selector. Clipping to it keeps the page out of the picture.
  const cdp = await noticed.context().newCDPSession(noticed);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const walk = function* (n) {
    yield n;
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) yield* walk(c);
  };
  let clip = null;
  for (const node of walk(root)) {
    const attributes = node.attributes ?? [];
    if (attributes.includes('class') && attributes[attributes.indexOf('class') + 1] === 'card') {
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId: node.nodeId });
      const [x1, y1, x2, , , y3] = model.border;
      clip = { x: x1 - 26, y: y1 - 26, width: x2 - x1 + 52, height: y3 - y1 + 52 };
      break;
    }
  }
  await cdp.detach();

  // Capture the card alone, on transparency, so the site's own background
  // shows through instead of a white rectangle from the page behind it. The
  // notice host is a child of <html>, not <body>, so hiding the body leaves it.
  await noticed.addStyleTag({
    content: 'html, body { background: transparent !important; } body { visibility: hidden !important; }',
  });
  await noticed.waitForTimeout(200);
  await noticed.screenshot({
    path: `${OUT}/shot-notice.png`,
    omitBackground: true,
    ...(clip ? { clip } : {}),
  });
  await noticed.close();

  const gate = await context.newPage();
  await gate.setViewportSize({ width: 400, height: 640 });
  await gate.addInitScript(() => {
    chrome.runtime.sendMessage = async (message) =>
      message.type === 'get-report'
        ? { status: 'not-granted', url: 'https://example.com/', site: 'example.com',
            originPattern: 'https://example.com/*', reason: 'Veyl has not been given access to this site yet.' }
        : { ok: true };
  });
  await gate.goto(`chrome-extension://${id}/popup/index.html`);
  await gate.waitForSelector('.gate__title', { timeout: 20_000 });
  await gate.locator('.gate').screenshot({ path: `${OUT}/shot-gate.png` });

  console.log('captured 6 dark panels into', OUT);
} finally {
  await context.close();
  server.close();
  await dispose();
}
