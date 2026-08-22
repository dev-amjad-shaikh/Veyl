/**
 * Renders the Chrome Web Store listing images.
 *
 * The screenshots are captures of the extension actually running against the
 * e2e fixture — a real Chrome, the real build, real requests to Google, Meta,
 * TikTok, Criteo and Stripe. Nothing here is a mock-up, because a store listing
 * that promises more than the build delivers is the thing reviewers reject and
 * users uninstall.
 */
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extensionId, launch, serveFixture, stubLanguageModel, waitUntilReady } from '../e2e/harness.mjs';

const OUT = 'store/assets';
const GUIDE = 'docs/images';
/** Pass `--dark` to render everything in dark mode, for checking the palette. */
const SCHEME = process.argv.includes('--dark') ? 'dark' : 'light';
const SHOTS = 'store/assets/.captures';
const EXTENSION = resolve('dist-e2e');

const PANELS = [
  {
    file: 'screenshot-1-exposure.png',
    headline: 'What is this site<br>learning about you?',
    sub: 'Veyl watches every request a page makes and names the companies on the other end — in plain language, not jargon.',
    capture: 'top',
  },
  {
    file: 'screenshot-2-evidence.png',
    headline: 'Every claim shows<br>its evidence',
    sub: 'Observed, declared, inferred or unknown. Open any line to see exactly what it rests on. “None seen” is never dressed up as “none”.',
    capture: 'exposure',
  },
  {
    file: 'screenshot-3-consistency.png',
    headline: 'What they say,<br>against what they do',
    sub: 'Veyl reads the site’s own privacy policy on your device and checks it against what actually happened while you were there.',
    capture: 'consistency',
  },
  {
    file: 'screenshot-4-ask.png',
    headline: 'Ask in your<br>own words',
    sub: 'Answered by Chrome’s on-device model from the evidence on screen. Your question never leaves your computer — Veyl has no server.',
    capture: 'ask',
  },
  {
    file: 'screenshot-5-permission.png',
    headline: 'It asks for nothing<br>when you install it',
    sub: 'Veyl requests no access to any website up front. You allow it one site at a time, and Chrome enforces that — not our good intentions.',
    capture: 'gate',
  },
];

const MARK = `<svg viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">
  <rect width="100" height="100" rx="23" fill="#11141c"/>
  <path d="M28 30 L50 74" stroke="#ffffff" stroke-width="11.5" stroke-linecap="round" fill="none"/>
  <path d="M50 74 L72 30" stroke="#6f9dff" stroke-width="11.5" stroke-linecap="round" fill="none"/>
</svg>`;

const page = (body, styles) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    color: #14161b;
  }
  ${styles}
</style>${body}`;

async function captureExtension() {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  const { server, origin } = await serveFixture();
  const { context, dispose } = await launch(EXTENSION, { deviceScaleFactor: 2, colorScheme: SCHEME });
  try {
    const id = await extensionId(context);
    await waitUntilReady(context);

    const site = await context.newPage();
    await site.goto(origin, { waitUntil: 'load' });
    await site.waitForTimeout(4500);

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 396, height: 1200 });
    await popup.addInitScript(stubLanguageModel, [
      'Three advertising companies — Google, Meta and TikTok — were told you looked at this page, ',
      'and Hotjar can replay how you moved around it. ',
      'None of them needed to be here for the page to work.',
    ]);
    await popup.goto(`chrome-extension://${id}/popup/index.html`);
    const tabId = await popup.evaluate(async () => (await chrome.tabs.query({ url: 'http://shop.example/*' }))[0].id);
    await popup.goto(`chrome-extension://${id}/popup/index.html?tab=${tabId}`);
    await popup.waitForSelector('.header__site', { timeout: 20_000 });
    await popup.waitForSelector('.finding--discrepancy', { timeout: 20_000 });

    await popup.screenshot({ path: `${SHOTS}/top.png`, clip: { x: 0, y: 0, width: 396, height: 300 } });

    // The user guide uses the panels unadorned, so the pictures match what a
    // person sees. Everything here comes from the synthetic test fixture — no
    // real browsing appears in any published image.
    const guide = async (file, selector) => {
      await popup.locator(selector).first().screenshot({ path: `${GUIDE}/${file}` });
    };
    await popup.screenshot({ path: `${GUIDE}/report-top.png`, clip: { x: 0, y: 0, width: 396, height: 300 } });
    await guide('services.png', '.section:has(.tag--functional)');
    await guide('cookies.png', '.section:has-text("Cookies (")');
    await guide('policy.png', '.section:has(.stances)');
    await guide('protection.png', '.section:has(.levels)');
    await guide('may-know.png', '.section:has-text("What they may know")');
    await guide('unknowns.png', '.section:has-text("What Veyl cannot tell you")');

    // Ask a question so the answer is real streamed output, not a placeholder.
    await popup.locator('.ask__chip').first().click();
    await popup.waitForFunction(() => document.querySelector('.ask__answer')?.textContent?.includes('work.'));
    await popup.locator('.section', { hasText: 'Ask Veyl' }).screenshot({ path: `${SHOTS}/ask.png` });
    await popup.locator('.section', { hasText: 'Ask Veyl' }).screenshot({ path: `${GUIDE}/ask.png` });

    // Open the exposure disclosures and one evidence trail beneath them.
    await popup.locator('.dimensions .disclosure__summary').first().click();
    await popup.locator('.statement__evidence summary').first().click();
    await popup.waitForTimeout(300);
    await popup.locator('.section', { hasText: 'Privacy exposure' }).screenshot({ path: `${SHOTS}/exposure.png` });
    await popup.locator('.section', { hasText: 'Privacy exposure' }).screenshot({ path: `${GUIDE}/exposure.png` });

    await popup
      .locator('.section', { hasText: 'What they say vs what they do' })
      .screenshot({ path: `${SHOTS}/consistency.png` });
    await popup
      .locator('.section', { hasText: 'What they say vs what they do' })
      .screenshot({ path: `${GUIDE}/consistency.png` });

    const gate = await context.newPage();
    await gate.setViewportSize({ width: 396, height: 620 });
    await gate.addInitScript(() => {
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
    await gate.goto(`chrome-extension://${id}/popup/index.html`);
    await gate.waitForSelector('.gate__title', { timeout: 20_000 });
    await gate.locator('.gate').screenshot({ path: `${SHOTS}/gate.png` });
    await gate.locator('.gate').screenshot({ path: `${GUIDE}/permission-gate.png` });

    const options = await context.newPage();
    await options.setViewportSize({ width: 860, height: 1400 });
    await options.goto(`chrome-extension://${id}/options/index.html`);
    await options.waitForSelector('.shell__title');
    await options.waitForTimeout(500);
    await options.screenshot({ path: `${GUIDE}/settings.png`, fullPage: true });
  } finally {
    await context.close();
    server.close();
    await dispose();
  }
}

const PAGE_FILE = resolve(`${SHOTS}/compose.html`);

async function render(canvas, html) {
  await writeFile(PAGE_FILE, html);
  await canvas.goto(`file://${PAGE_FILE}?t=${Date.now()}`);
  await canvas.waitForLoadState('networkidle');
  await canvas.evaluate(() => document.fonts.ready);
}

async function compose() {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 1, colorScheme: SCHEME });
  const canvas = await context.newPage();

  for (const panel of PANELS) {
    const shot = resolve(`${SHOTS}/${panel.capture}.png`);
    const html = page(
      `<div class="frame">
         <div class="copy">
           <div class="brand">${MARK}<span>Veyl</span></div>
           <h1>${panel.headline}</h1>
           <p>${panel.sub}</p>
         </div>
         <div class="shot"><img src="file://${shot}" alt=""></div>
       </div>`,
      `.frame {
         width: 1280px; height: 800px; display: grid; grid-template-columns: 1fr 460px;
         align-items: center; gap: 56px; padding: 0 72px;
         background: linear-gradient(155deg, #f7f8fb 0%, #eef1f8 55%, #e6ebf7 100%);
       }
       .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }
       .brand svg { width: 38px; height: 38px; }
       .brand span { font-size: 21px; font-weight: 650; letter-spacing: -0.02em; }
       h1 { font-size: 50px; line-height: 1.12; font-weight: 660; letter-spacing: -0.035em; }
       p { margin-top: 22px; font-size: 19px; line-height: 1.55; color: #4d5566; max-width: 30em; }
       .shot { display: flex; justify-content: center; }
       .shot img {
         max-width: 396px; max-height: 700px; width: auto; height: auto; border-radius: 14px;
         box-shadow: 0 2px 6px rgb(16 20 28 / 8%), 0 24px 60px rgb(16 20 28 / 16%);
       }`
    );
    // Loaded from disk rather than set inline: an about:blank document is not
    // allowed to pull in file:// images, and the capture would come out empty.
    await canvas.setViewportSize({ width: 1280, height: 800 });
    await render(canvas, html);
    const name = SCHEME === 'dark' ? panel.file.replace('.png', '-dark.png') : panel.file;
    await canvas.screenshot({ path: `${OUT}/${name}` });
    console.log(`${OUT}/${name}  1280x800`);
  }

  const tile = (width, height, markSize, titleSize, subSize) =>
    page(
      `<div class="tile">${MARK}<div><h1>Veyl</h1><p>See what a website is really doing with your data.</p></div></div>`,
      `.tile {
         width: ${width}px; height: ${height}px; display: flex; align-items: center; gap: ${markSize / 3}px;
         padding: 0 ${markSize / 1.6}px;
         background: radial-gradient(120% 140% at 12% 0%, #1d2740 0%, #11141c 60%);
         color: #fff;
       }
       .tile svg { width: ${markSize}px; height: ${markSize}px; flex: none; }
       h1 { font-size: ${titleSize}px; font-weight: 680; letter-spacing: -0.035em; }
       p { margin-top: ${subSize / 3}px; font-size: ${subSize}px; line-height: 1.4; color: #aab3c6; }`
    );

  for (const [file, w, h, mark, title, sub] of [
    ['promo-small-440x280.png', 440, 280, 84, 42, 15],
    ['promo-marquee-1400x560.png', 1400, 560, 190, 104, 34],
  ]) {
    await canvas.setViewportSize({ width: w, height: h });
    await render(canvas, tile(w, h, mark, title, sub));
    await canvas.screenshot({ path: `${OUT}/${file}` });
    console.log(`${OUT}/${file}  ${w}x${h}`);
  }

  await browser.close();
}

await mkdir(OUT, { recursive: true });
await mkdir(GUIDE, { recursive: true });
await captureExtension();
await compose();
await rm(SHOTS, { recursive: true, force: true });
console.log('\nStore images ready in store/assets/');
