/**
 * Runs in the page's own JavaScript world at document_start, before the site's
 * scripts, and counts calls to the browser APIs used for fingerprinting and
 * cross-site tracking.
 *
 * It observes. It does not lie to the page: every wrapper calls through to the
 * original and returns the real value. Breaking a site to hide from it would
 * make Veyl the thing that broke your checkout.
 *
 * Two limits are stated plainly rather than papered over:
 *  - a page could remove these wrappers, because this code runs in the page's
 *    world by necessity; and
 *  - work done inside a cross-origin iframe we are not injected into is invisible.
 */
type SignalKind =
  | 'canvas-readback'
  | 'webgl-parameters'
  | 'audio-fingerprint'
  | 'font-enumeration'
  | 'device-enumeration'
  | 'battery'
  | 'hardware-profile'
  | 'topics-api'
  | 'protected-audience'
  | 'storage-access';

const EVENT = 'veyl:page-signals';
const ATTRIBUTION_LIMIT = 3;
const FONT_CHECK_THRESHOLD = 20;

const counts = new Map<string, { kind: SignalKind; calls: number; attributedTo?: string }>();
const attributionAttempts = new Map<SignalKind, number>();
let flushTimer: number | null = null;

function attribute(kind: SignalKind): string | undefined {
  const attempts = attributionAttempts.get(kind) ?? 0;
  if (attempts >= ATTRIBUTION_LIMIT) return undefined;
  attributionAttempts.set(kind, attempts + 1);
  try {
    const stack = new Error().stack ?? '';
    const here = location.hostname;
    for (const match of stack.matchAll(/https?:\/\/([^/:)\s]+)/g)) {
      const host = match[1];
      if (host && host !== here) return registrableish(host);
    }
  } catch {
    /* stacks are best-effort */
  }
  return undefined;
}

/** A rough eTLD+1 for display only; the service worker does the authoritative parse. */
function registrableish(host: string): string {
  const labels = host.split('.');
  return labels.length > 2 ? labels.slice(-2).join('.') : host;
}

function note(kind: SignalKind): void {
  const attributedTo = attribute(kind);
  const key = `${kind}|${attributedTo ?? ''}`;
  const existing = counts.get(key);
  if (existing) existing.calls += 1;
  else counts.set(key, attributedTo ? { kind, calls: 1, attributedTo } : { kind, calls: 1 });
  schedule();
}

function schedule(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(flush, 700);
}

function flush(): void {
  flushTimer = null;
  if (counts.size === 0) return;
  const payload = [...counts.values()];
  counts.clear();
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify(payload) }));
  } catch {
    /* the page may have been torn down */
  }
}

function wrap<T extends object, K extends keyof T>(target: T, key: K, onCall: () => void): void {
  const original = target[key];
  if (typeof original !== 'function') return;
  const replacement = function (this: unknown, ...args: unknown[]) {
    try {
      onCall();
    } catch {
      /* never let instrumentation break the page */
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
  try {
    Object.defineProperty(replacement, 'name', { value: (original as { name: string }).name });
    Object.defineProperty(replacement, 'toString', {
      value: () => Function.prototype.toString.call(original),
      writable: true,
      configurable: true,
    });
    target[key] = replacement as unknown as T[K];
  } catch {
    /* frozen prototype; leave it alone */
  }
}

// --- canvas ---------------------------------------------------------------
// Reading pixels back is only a fingerprinting signal when text was drawn
// first — that is the technique. Games and image editors read pixels all day
// and should not be reported as trackers.
const textPainted = new WeakSet<object>();

if (typeof CanvasRenderingContext2D !== 'undefined') {
  for (const method of ['fillText', 'strokeText'] as const) {
    wrapContext(method);
  }
  wrap(CanvasRenderingContext2D.prototype, 'getImageData', function (this: CanvasRenderingContext2D) {
    if (textPainted.has(this.canvas)) note('canvas-readback');
  } as () => void);
}

function wrapContext(method: 'fillText' | 'strokeText'): void {
  const proto = CanvasRenderingContext2D.prototype;
  const original = proto[method];
  proto[method] = function (this: CanvasRenderingContext2D, ...args: never[]) {
    try {
      textPainted.add(this.canvas);
    } catch {
      /* ignore */
    }
    return (original as (...a: never[]) => void).apply(this, args);
  } as typeof original;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  for (const method of ['toDataURL', 'toBlob']) {
    const original = proto[method];
    if (typeof original !== 'function') continue;
    proto[method] = function (this: HTMLCanvasElement, ...args: unknown[]) {
      try {
        // A small canvas that was never shown is the shape of a fingerprint probe.
        if (textPainted.has(this) || (this.width <= 400 && this.height <= 200)) note('canvas-readback');
      } catch {
        /* ignore */
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

// --- WebGL ----------------------------------------------------------------
const DEBUG_RENDERER_INFO = [0x9245, 0x9246]; // UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL

for (const ctor of [
  typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext : null,
  typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null,
]) {
  if (!ctor) continue;
  const proto = ctor.prototype;
  const original = proto.getParameter;
  proto.getParameter = function (this: WebGLRenderingContext, name: number) {
    try {
      if (DEBUG_RENDERER_INFO.includes(name)) note('webgl-parameters');
    } catch {
      /* ignore */
    }
    return original.call(this, name);
  };
}

// --- audio ----------------------------------------------------------------
if (typeof AnalyserNode !== 'undefined') {
  wrap(AnalyserNode.prototype, 'getFloatFrequencyData', () => note('audio-fingerprint'));
}
if (typeof OfflineAudioContext !== 'undefined') {
  wrap(OfflineAudioContext.prototype, 'startRendering', () => note('audio-fingerprint'));
}

// --- fonts ----------------------------------------------------------------
let fontChecks = 0;
if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.check === 'function') {
  const original = document.fonts.check.bind(document.fonts);
  document.fonts.check = ((font: string, text?: string) => {
    fontChecks += 1;
    if (fontChecks === FONT_CHECK_THRESHOLD) note('font-enumeration');
    return original(font, text);
  }) as typeof document.fonts.check;
}

// --- device and hardware --------------------------------------------------
if (navigator.mediaDevices) {
  wrap(navigator.mediaDevices, 'enumerateDevices', () => note('device-enumeration'));
}
wrap(navigator as unknown as Record<string, unknown>, 'getBattery' as never, () => note('battery'));

for (const property of ['hardwareConcurrency', 'deviceMemory'] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, property);
  if (!descriptor?.get) continue;
  const getter = descriptor.get;
  try {
    Object.defineProperty(Navigator.prototype, property, {
      ...descriptor,
      get(this: Navigator) {
        try {
          note('hardware-profile');
        } catch {
          /* ignore */
        }
        return getter.call(this);
      },
    });
  } catch {
    /* ignore */
  }
}

// --- Privacy Sandbox ------------------------------------------------------
// These replace third-party cookies rather than removing tracking, so Veyl
// reports them the same way it reports anything else that profiles you.
const doc = document as unknown as Record<string, unknown>;
if (typeof doc['browsingTopics'] === 'function') {
  wrap(doc, 'browsingTopics', () => note('topics-api'));
}
const nav = navigator as unknown as Record<string, unknown>;
for (const method of ['joinAdInterestGroup', 'runAdAuction', 'leaveAdInterestGroup']) {
  if (typeof nav[method] === 'function') wrap(nav, method, () => note('protected-audience'));
}
if (typeof doc['requestStorageAccess'] === 'function') {
  wrap(doc, 'requestStorageAccess', () => note('storage-access'));
}

// --- what trackers are set up to take from forms --------------------------
//
// An advertising pixel that harvests form fields has to be told which fields to
// take, and it keeps that instruction in the page so its own code can read it.
// So can we — which means Veyl can say what a page is set up to collect before
// anyone types a character, without reading a character.
//
// Nothing here touches a form, a field, or a value. It reads the tracker's
// configuration and nothing else. When the configuration cannot be found the
// answer is "unknown", never "none".

const HARVEST_EVENT = 'veyl:page-harvest';

/** Meta's field codes. `cn` and `country` are both seen in the wild. */
const META_FIELDS: Record<string, string> = {
  em: 'email',
  ph: 'phone',
  fn: 'first-name',
  ln: 'last-name',
  ct: 'city',
  st: 'state',
  zp: 'postcode',
  ge: 'gender',
  db: 'date-of-birth',
  cn: 'country',
  country: 'country',
  external_id: 'site-id',
};

function readMetaHarvest(): { entryId: string; accountId: string; fields: string[] }[] {
  const out: { entryId: string; accountId: string; fields: string[] }[] = [];
  try {
    const fbq = (window as unknown as Record<string, unknown>)['fbq'] as
      | Record<string, unknown>
      | undefined;
    const modules = fbq?.['__fbeventsResolvedModules'] as Record<string, unknown> | undefined;
    const store = modules?.['SignalsFBEventsConfigStore'] as Record<string, unknown> | undefined;
    const configs = (store?.['_configStore'] as Record<string, unknown> | undefined)?.[
      'automaticMatching'
    ] as Record<string, { selectedMatchKeys?: unknown }> | undefined;
    if (!configs) return out;

    for (const [accountId, config] of Object.entries(configs).slice(0, 8)) {
      const keys = config?.selectedMatchKeys;
      if (!Array.isArray(keys)) continue;
      const fields = [
        ...new Set(
          keys
            .filter((key): key is string => typeof key === 'string')
            .map((key) => META_FIELDS[key])
            .filter((field): field is string => Boolean(field))
        ),
      ];
      if (fields.length > 0 && /^[0-9]{6,24}$/.test(accountId)) {
        out.push({ entryId: 'meta-pixel', accountId, fields });
      }
    }
  } catch {
    // The page can shape these objects however it likes. Finding nothing is a
    // valid answer; guessing is not.
  }
  return out;
}

let lastHarvest = '';

function reportHarvest(): void {
  const configs = readMetaHarvest();
  if (configs.length === 0) return;
  const payload = JSON.stringify(configs);
  if (payload === lastHarvest) return; // nothing new to say
  lastHarvest = payload;
  try {
    window.dispatchEvent(new CustomEvent(HARVEST_EVENT, { detail: payload }));
  } catch {
    /* the page may have been torn down */
  }
}

// The pixel loads its configuration well after document_start, and a tag
// manager can add another one minutes later. A handful of looks costs nothing
// and stops after the page has settled.
for (const delay of [1200, 3000, 6000, 12_000]) {
  setTimeout(reportHarvest, delay);
}

window.addEventListener('pagehide', flush, { capture: true });
