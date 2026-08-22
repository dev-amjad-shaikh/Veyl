/**
 * Shared plumbing for driving the built extension in a real Chrome: the fixture
 * site, the browser launch, and the wait for a freshly installed extension to
 * finish registering its page scripts.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function serveFixture() {
  const index = await readFile('e2e/fixture/index.html');
  const privacy = await readFile('e2e/fixture/privacy.html');
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url?.startsWith('/privacy') ? privacy : index);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, origin: `http://shop.example:${server.address().port}` };
}

export async function launch(extensionDir, { hosts = ['shop.example'], ...options } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'veyl-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    ...options,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      `--host-resolver-rules=${hosts.map((host) => `MAP ${host} 127.0.0.1`).join(', ')}`,
    ],
  });
  return { context, profile, dispose: () => rm(profile, { recursive: true, force: true }) };
}

export async function extensionId(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  return new URL(worker.url()).host;
}

/**
 * A freshly installed extension registers its page scripts asynchronously.
 * In normal use that happens long before you browse; here it has to be waited
 * for, or the first navigation genuinely is unwatched.
 */
export async function waitUntilReady(context) {
  const worker = context.serviceWorkers()[0];
  for (let i = 0; i < 40; i++) {
    const registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    if (registered.length >= 2) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('the extension never registered its page scripts');
}

/** Makes Chrome's on-device model appear present, so the Ask panel can be driven. */
export const stubLanguageModel = (answer) => {
  const chunks = answer;
  globalThis.LanguageModel = {
    availability: async () => 'available',
    create: async () => ({
      promptStreaming(input) {
        globalThis.__lastPrompt = input;
        return new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        });
      },
      destroy() {},
    }),
  };
};
