/**
 * The only thing Veyl ever draws on a page you are reading.
 *
 * Two surfaces, and no more. A hairline along the top, which carries the
 * exposure level and nothing else; and a card, which appears for exactly two
 * findings: a tracker here is configured to take what you type, or something
 * personal was seen leaving. Everything else belongs in the panel, where you
 * went looking for it.
 *
 * It lives in a closed shadow root so the page cannot restyle it into
 * something it is not, and it never moves the page's own layout. A person who
 * dismisses it is not asked again on this site until the browser closes.
 */
import type { ExposureLevel } from '../domain/types';

interface Card {
  tone: 'warn' | 'ok';
  title: string;
  body: string;
  /** Field names, shown as chips. The finding, not decoration. */
  fields?: string[];
  footnote?: string;
}

const HOST_ID = 'veyl-notice';
const LEVEL_COLOURS: Record<ExposureLevel, string> = {
  'none-seen': '#1a8f4d',
  low: '#4f9439',
  medium: '#bf7d16',
  high: '#bc3336',
  unknown: '#6b7280',
};

let root: ShadowRoot | null = null;
/** Set when the person closes the card. Nothing re-opens it on this page. */
let cardDismissed = false;
/** Set when they say "not on this site". Everything goes, including the line. */
let silenced = false;

function mount(): ShadowRoot | null {
  if (root) return root;
  if (!document.documentElement) return null;
  const host = document.createElement('div');
  host.id = HOST_ID;
  // `all: initial` first, so a page's `div { … }` cannot reach the host itself.
  host.setAttribute(
    'style',
    'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;'
  );
  root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS}</style>`;
  document.documentElement.appendChild(host);
  return root;
}

/** Mirrors what is on screen onto the host, where it can be seen and tested. */
function mark(name: string, value: string | null): void {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  if (value === null) host.removeAttribute(name);
  else host.setAttribute(name, value);
}

const CSS = `
:host, * { box-sizing: border-box; }
.hairline {
  position: fixed; top: 0; left: 0; right: 0; height: 3px;
  pointer-events: none;
}

/*
 * The same language as the panel: a card that carries its severity in a
 * coloured edge rather than a filled background, generous padding, and space
 * doing the separating.
 */
.card {
  position: fixed; right: 16px; bottom: 16px; width: 352px; max-width: calc(100vw - 32px);
  pointer-events: auto;
  background: #fff; color: #0e1218;
  border: 1px solid #e5e9f0; border-left: 3px solid #bc3336; border-radius: 12px;
  box-shadow: 0 2px 4px rgb(16 20 28 / 5%), 0 16px 44px rgb(16 20 28 / 14%);
  padding: 16px;
  font: 400 12.5px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  animation: rise 200ms cubic-bezier(0.2, 0, 0, 1);
}
.card[data-tone="ok"] { border-left-color: #1a8f4d; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }
@media (prefers-color-scheme: dark) {
  .card { background: #14181f; color: #e9ecf1; border-color: #2b323c; }
  .body { color: #b6bdc8 !important; }
  .chip { background: #2c1a1b !important; color: #f0686a !important; }
  .note { color: #8a929e !important; }
  .foot { border-top-color: #2b323c !important; }
}
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.mark { width: 14px; height: 14px; flex: none; }
.name { font-size: 9.5px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: #79828f; }
.x {
  margin-left: auto; border: 0; background: none; cursor: pointer;
  color: #79828f; font-size: 16px; line-height: 1; padding: 0 2px;
  border-radius: 5px;
}
.x:hover { color: #0e1218; }
.title { font-size: 13.5px; font-weight: 620; line-height: 1.4; letter-spacing: -0.01em; color: #bc3336; }
.card[data-tone="ok"] .title { color: #1a8f4d; }
.body { margin: 7px 0 0; color: #4b5563; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 0; padding: 0; list-style: none; }
.chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px;
  background: #fcecea; color: #8f2723; border-radius: 5px; padding: 3px 7px;
}
.note { display: block; margin-top: 10px; font-size: 11px; line-height: 1.6; color: #79828f; }
.foot { display: flex; align-items: center; gap: 14px; margin-top: 14px; padding-top: 11px; border-top: 1px solid #eef1f6; }
.foot button {
  border: 0; background: none; padding: 0; cursor: pointer;
  font: inherit; font-size: 11.5px; color: #2b57d4;
}
.foot button:hover { text-decoration: underline; }
`;

const MARK =
  '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true">' +
  '<path d="M28 30 L50 74" stroke="currentColor" stroke-width="13" stroke-linecap="round" fill="none"/>' +
  '<path d="M50 74 L72 30" stroke="#2b57d4" stroke-width="13" stroke-linecap="round" fill="none"/></svg>';

export function showHairline(level: ExposureLevel): void {
  const shadow = mount();
  if (!shadow || silenced) return;
  let line = shadow.querySelector<HTMLDivElement>('.hairline');
  if (!line) {
    line = document.createElement('div');
    line.className = 'hairline';
    shadow.appendChild(line);
  }
  line.style.background = LEVEL_COLOURS[level];
  mark('data-veyl-hairline', level);
}

export function hideHairline(): void {
  root?.querySelector('.hairline')?.remove();
  mark('data-veyl-hairline', null);
}

/** Renders the card. Calling it again with the same key does nothing. */
let shownKey = '';

export function showCard(key: string, card: Card, onMute: () => void): void {
  const shadow = mount();
  if (!shadow || silenced || cardDismissed || shownKey === key) return;
  shownKey = key;
  shadow.querySelector('.card')?.remove();

  const element = document.createElement('div');
  element.className = 'card';
  element.dataset.tone = card.tone;
  element.setAttribute('role', 'status');

  const chips = card.fields?.length
    ? `<ul class="chips">${card.fields.map((f) => `<li class="chip"></li>`).join('')}</ul>`
    : '';

  element.innerHTML =
    `<div class="head">${MARK}<span class="name">Veyl</span>` +
    `<button class="x" type="button" aria-label="Dismiss">&times;</button></div>` +
    `<div class="title"></div><p class="body"></p>${chips}` +
    (card.footnote ? '<span class="note"></span>' : '') +
    `<div class="foot"><button type="button" data-act="mute">Not on this site</button>` +
    `<button type="button" data-act="open">Open Veyl</button></div>`;

  // Text is assigned rather than interpolated: a tracker's name is data, and
  // data never becomes markup.
  element.querySelector('.title')!.textContent = card.title;
  element.querySelector('.body')!.textContent = card.body;
  if (card.footnote) element.querySelector('.note')!.textContent = card.footnote;
  const chipNodes = element.querySelectorAll('.chip');
  card.fields?.forEach((field, i) => {
    if (chipNodes[i]) chipNodes[i].textContent = field;
  });

  // Closing the card closes it for good on this page. The hairline stays as the
  // quiet version of the same fact — loud once, then out of the way.
  const close = () => {
    cardDismissed = true;
    element.remove();
    mark('data-veyl-card', null);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey, true);

  element.querySelector('.x')!.addEventListener('click', close);
  element.querySelector('[data-act="mute"]')!.addEventListener('click', () => {
    // "Not on this site" means all of it, including the line.
    silenced = true;
    close();
    hideHairline();
    onMute();
  });
  element.querySelector('[data-act="open"]')!.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'open-panel' }).catch(() => {});
  });

  shadow.appendChild(element);
  element.style.bottom = `${clearOfBottomFurniture()}px`;
  mark('data-veyl-card', card.tone);
}

/**
 * Sites put their own things in the bottom-right corner — cookie banners, chat
 * bubbles, "we value your privacy". Veyl covering one of them would be rude and
 * would also hide the very consent choice it is telling you about, so look for
 * anything pinned to the bottom of the viewport and sit above it.
 */
function clearOfBottomFurniture(): number {
  const gap = 16;
  let highest = 0;
  const probes: [number, number][] = [
    [window.innerWidth - 90, window.innerHeight - 20],
    [window.innerWidth / 2, window.innerHeight - 20],
    [window.innerWidth - 90, window.innerHeight - 70],
  ];

  for (const [x, y] of probes) {
    for (const element of document.elementsFromPoint(x, y)) {
      if (element.id === HOST_ID) continue;
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const box = element.getBoundingClientRect();
      // Only things actually resting on the bottom edge are in our way.
      if (box.bottom < window.innerHeight - 4 || box.height > window.innerHeight * 0.6) continue;
      highest = Math.max(highest, window.innerHeight - box.top);
      break;
    }
  }
  return highest > 0 ? Math.round(highest) + gap : gap;
}

export function teardown(): void {
  document.getElementById(HOST_ID)?.remove();
  root = null;
  shownKey = '';
}
