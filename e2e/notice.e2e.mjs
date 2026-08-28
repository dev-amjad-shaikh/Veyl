/**
 * The two things Veyl is allowed to draw on a page you are reading, in a real
 * Chrome: the hairline, and the card. Plus the promise that governs both —
 * dismissing it means dismissed, and it never moves the page's own layout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { extensionId, launch, serveFixture, waitUntilReady } from './harness.mjs';

const EXTENSION = join(process.cwd(), 'dist-e2e');
const HOST = '#veyl-notice';

test('Veyl draws the finding on the page, and stops when told', async (t) => {
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
  await page.setViewportSize({ width: 1100, height: 780 });

  // The page's own layout must be identical with and without Veyl's notice.
  await page.goto(SITE, { waitUntil: 'load' });
  const before = await page.evaluate(() => document.body.getBoundingClientRect().top);

  await page.waitForSelector(`${HOST}[data-veyl-card]`, { timeout: 25_000 });

  // The fixture's pixel named an email address and a postcode in its own
  // parameters, and balanced protection stopped the request.
  assert.equal(
    await page.getAttribute(HOST, 'data-veyl-card'),
    'ok',
    'a blocked send is good news, and must not be coloured as a warning'
  );
  assert.equal(
    await page.getAttribute(HOST, 'data-veyl-hairline'),
    'high',
    'a page contacting seven trackers is high exposure, and the hairline says so'
  );

  const after = await page.evaluate(() => document.body.getBoundingClientRect().top);
  assert.equal(after, before, 'the notice must never push the page around');

  // The card rises in over 200ms; capture it settled, not mid-animation.
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'evidence/page-notice.png' });

  // --- what it says --------------------------------------------------------
  const card = await readCard(page);
  assert.match(card.title, /Veyl stopped something personal leaving/i);
  assert.match(card.body, /Meta Pixel/);
  assert.match(card.body, /\bemail\b/i);
  assert.match(card.body, /postcode/i);
  assert.match(card.footnote, /never what it carried/i);

  // The value the parameter carried must not have travelled to the page.
  assert.ok(
    !JSON.stringify(card).includes('1f0c3a5b7d9e2468'),
    'the notice knows which parameter carried it, never what it carried'
  );

  // --- closing it means closed --------------------------------------------
  // The × closes the note for good on this page, and leaves the hairline as the
  // quiet version of the same fact. Nothing brings the note back here.
  await click(page, '[aria-label="Dismiss"]');
  await page.waitForSelector(`${HOST}:not([data-veyl-card])`, { timeout: 5000 });
  assert.equal(
    await page.getAttribute(HOST, 'data-veyl-hairline'),
    'high',
    'closing the note must not throw away the finding, only the interruption'
  );

  // A fresh visit is a fresh page: the note is allowed back until muted.
  await page.reload({ waitUntil: 'load' });
  // A cold service worker can take a while to come back after a reload, so give
  // this more headroom than the first appearance needed.
  await page.waitForSelector(`${HOST}[data-veyl-card]`, { timeout: 45_000 });

  // --- "not on this site" means all of it ---------------------------------
  await click(page, '[data-act="mute"]');
  await page.waitForSelector(`${HOST}:not([data-veyl-card])`, { timeout: 5000 });
  assert.equal(await page.getAttribute(HOST, 'data-veyl-hairline'), null, 'the hairline goes too');

  // A second visit to the same site stays quiet for the rest of the session.
  const second = await context.newPage();
  await second.goto(SITE, { waitUntil: 'load' });
  await second.waitForTimeout(6000);
  // Muted means Veyl never even builds the host element, let alone draws in it.
  assert.equal(
    await second.locator(`${HOST}[data-veyl-card]`).count(),
    0,
    '"not on this site" has to mean it'
  );
  assert.equal(await second.locator(HOST).count(), 0, 'nothing of Veyl is added to a muted page');

  // --- and the panel is where the detail lives -----------------------------
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/popup/index.html`);
  const tabId = await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://shop.example/*' });
    return tab.id;
  });
  await panel.goto(`chrome-extension://${id}/popup/index.html?tab=${tabId}`);
  await panel.waitForSelector('.header__site', { timeout: 20_000 });
  assert.ok(
    (await panel.locator('.harvest').count()) > 0,
    'the same finding is in the panel, in full'
  );
});

/**
 * The notice lives in a *closed* shadow root, so that a hostile page cannot
 * rewrite what Veyl is telling you. That also puts it out of reach of ordinary
 * selectors, so the test goes in the way a person's eyes do — through the
 * rendering engine itself.
 */
async function pierce(page) {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  await cdp.detach();
  return root;
}

/** Depth-first walk over a CDP node tree, shadow roots included. */
function* walk(node) {
  yield node;
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) yield* walk(child);
}

function classesOf(node) {
  const attributes = node.attributes ?? [];
  const index = attributes.indexOf('class');
  return index === -1 ? '' : attributes[index + 1];
}

function textUnder(node) {
  let out = '';
  for (const descendant of walk(node)) {
    if (descendant.nodeName === '#text') out += descendant.nodeValue ?? '';
  }
  return out.trim();
}

async function readCard(page) {
  const document = await pierce(page);
  const found = { title: '', body: '', footnote: '' };
  const wanted = { title: 'title', body: 'body', note: 'footnote' };
  for (const node of walk(document)) {
    const key = wanted[classesOf(node)];
    if (key && !found[key]) found[key] = textUnder(node);
  }
  return found;
}

/**
 * Clicking a button inside a closed root: dispatch at its coordinates, which is
 * exactly what a person does.
 */
async function click(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const attribute = selector.slice(1, -1).split('=')[1].replace(/"/g, '');
  for (const node of walk(root)) {
    const attributes = node.attributes ?? [];
    if (attributes.includes(attribute) || textUnder(node) === 'Not on this site') {
      if (node.nodeName !== 'BUTTON') continue;
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId: node.nodeId });
      const [x1, y1, x2, , , y3] = model.content;
      await cdp.detach();
      await page.mouse.click((x1 + x2) / 2, (y1 + y3) / 2);
      return;
    }
  }
  await cdp.detach();
  throw new Error(`no button matching ${selector} in the notice`);
}

test('the report is a panel that follows you, and is configured as one', async (t) => {
  const { server, origin: SITE } = await serveFixture();
  const { context, dispose } = await launch(EXTENSION, { hosts: ['shop.example', 'other.example'] });
  t.after(async () => {
    await context.close();
    server.close();
    await dispose();
  });

  const id = await extensionId(context);
  await waitUntilReady(context);
  const worker = context.serviceWorkers()[0];

  // Chrome opens the panel from the toolbar icon rather than a popup card.
  const options = await worker.evaluate(() => chrome.sidePanel.getOptions({}));
  assert.match(options.path, /popup\/index\.html$/, 'the panel renders the report');
  // Deliberately false. `openPanelOnActionClick` makes Chrome open the panel
  // *instead of* delivering the action click — and that click is what grants
  // `activeTab`. Without it Veyl cannot read the address of the tab it is being
  // asked about, so on any site it has not already been given access to it can
  // only say "nothing to look at". The panel is opened from onClicked instead.
  const behavior = await worker.evaluate(() => chrome.sidePanel.getPanelBehavior());
  assert.equal(
    behavior.openPanelOnActionClick,
    false,
    'opening on action click would cost Veyl the activeTab grant it needs to name the site'
  );

  const first = await context.newPage();
  await first.goto(SITE, { waitUntil: 'load' });

  // The panel is the same page, unpinned, so it reports on whatever is in front.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/popup/index.html`);
  await first.bringToFront();
  await panel.waitForFunction(
    () => document.querySelector('.header__site')?.textContent === 'shop.example',
    { timeout: 20_000 }
  );

  // Browse somewhere else. A panel that stayed on the last site would be lying.
  const second = await context.newPage();
  await second.goto(`http://other.example:${server.address().port}/`, { waitUntil: 'load' });
  await panel.waitForFunction(
    () => document.querySelector('.header__site')?.textContent !== 'shop.example',
    { timeout: 20_000 }
  );
});

/**
 * The defect this guards against: the badge was painted once, shortly after the
 * main-frame request, and then never again. Most of what a page does happens
 * after that moment, so the indicator could sit empty on a page full of
 * trackers — which is exactly what it did.
 */
test('the indicator keeps up with a page that loads trackers late', async (t) => {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/pixel')) {
      res.writeHead(200, { 'content-type': 'image/gif' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><title>Late</title><p>Nothing has happened yet.</p><script>
         setTimeout(function () {
           new Image().src = 'http://connect.facebook.net:${server.address().port}/pixel.gif';
         }, 2500);
       </script>`
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const { context, dispose } = await launch(EXTENSION, {
    hosts: ['late.example', 'connect.facebook.net'],
  });
  t.after(async () => {
    await context.close();
    server.close();
    await dispose();
  });

  await extensionId(context); // waits for the service worker to exist
  await waitUntilReady(context);
  const worker = context.serviceWorkers()[0];

  const page = await context.newPage();
  await page.goto(`http://late.example:${port}/`, { waitUntil: 'load' });
  const tabId = await worker.evaluate(
    async (m) => (await chrome.tabs.query({ url: m }))[0].id,
    'http://late.example/*'
  );

  // Before the tracker fires, there is genuinely nothing to report.
  await page.waitForTimeout(1800);
  const early = await worker.evaluate((id) => chrome.action.getTitle({ tabId: id }), tabId);
  assert.doesNotMatch(early, /tracking service/, `nothing had happened yet, but the badge said: ${early}`);

  // It fires at 2.5s. The indicator has to notice without a navigation.
  await page.waitForFunction(() => true);
  let title = '';
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    title = await worker.evaluate((id) => chrome.action.getTitle({ tabId: id }), tabId);
    if (/tracking service/.test(title)) break;
  }
  assert.match(title, /tracking service/, 'a tracker arriving after load must still reach the badge');

  const text = await worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  assert.notEqual(text, '', 'the badge must carry a count once there is something to count');
});
