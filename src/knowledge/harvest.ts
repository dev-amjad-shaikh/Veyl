/**
 * Reading what a request says it is carrying, without reading what it carries.
 *
 * Trackers label their own parameters. X sends `email_address=<hash>`, TikTok
 * sends `auto_email`, Meta sends `udff[em]` for a pixel configured through its
 * dashboard and `ud[em]` for one wired up by hand. The name is the evidence:
 * it tells you an email address was sent, by whom, and to where.
 *
 * Veyl never looks at the value beyond asking whether it is long and opaque
 * enough to be a real identifier rather than an empty field. Knowing what the
 * address actually was would not make the finding any truer, and would make
 * Veyl something it refuses to be.
 */
import type { HarvestField } from '../domain/types';

/** Parameters that state, in the tracker's own vocabulary, what they carry. */
const NAMED_PARAMETERS: Record<string, HarvestField> = {
  email_address: 'email', // X (Twitter) pixel
  phone_number: 'phone', // X (Twitter) pixel
  auto_email: 'email', // TikTok pixel, automatic advanced matching
  auto_phone: 'phone', // TikTok pixel
};

/** Meta's field codes, as they appear inside ud[…] / udff[…]. */
const META_FIELDS: Record<string, HarvestField> = {
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
  external_id: 'site-id',
};

const META_BRACKET = /[?&](ud|udff)(?:\[|%5B)([a-z_]{2,12})(?:\]|%5D)=([^&#]{1,512})/gi;

/**
 * Is this plausibly a real identifier rather than an empty or placeholder field?
 *
 * Hashed personal data is the normal case — every one of these trackers hashes
 * before sending — so this looks for the shape of a digest or an opaque token,
 * and deliberately rejects short or obviously-empty values so that a form the
 * person never filled in does not produce a finding.
 */
function looksCarried(raw: string): boolean {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* a malformed escape is still a value */
  }
  if (value.length < 16) return false;
  if (/^(undefined|null|none|false|true|0)$/i.test(value)) return false;
  return /^[0-9a-f]{32,128}$/i.test(value) || /^[A-Za-z0-9+/_=-]{16,512}$/.test(value);
}

/**
 * Which fields of personal information this request URL announces it is
 * carrying. Returns the parameter that named each one, as checkable evidence.
 */
export function fieldsInUrl(url: string): { field: HarvestField; parameter: string }[] {
  const found = new Map<HarvestField, string>();

  for (const match of url.matchAll(META_BRACKET)) {
    const [, prefix, code, value] = match;
    if (!prefix || !code || !value) continue;
    const field = META_FIELDS[code.toLowerCase()];
    if (!field || !looksCarried(value)) continue;
    if (!found.has(field)) found.set(field, `${prefix}[${code.toLowerCase()}]`);
  }

  const query = url.indexOf('?');
  if (query !== -1) {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(url.slice(query + 1));
    } catch {
      return [...found].map(([field, parameter]) => ({ field, parameter }));
    }
    for (const [name, value] of params) {
      const field = NAMED_PARAMETERS[name.toLowerCase()];
      if (!field || !looksCarried(value)) continue;
      if (!found.has(field)) found.set(field, name.toLowerCase());
    }
  }

  return [...found].map(([field, parameter]) => ({ field, parameter }));
}

/**
 * Trackers known to offer form-field harvesting, and whether Veyl can read the
 * setting or only observe the result.
 *
 * `readable` means the tracker keeps its configuration in the page, so Veyl can
 * say what it will take before anyone types. `opaque` means it does not, so the
 * honest answer until something is observed leaving is "unknown" — which is a
 * finding in its own right, not a gap to be filled with a guess.
 */
export const HARVESTERS: Record<string, 'readable' | 'opaque'> = {
  'meta-pixel': 'readable',
  'tiktok-pixel': 'opaque',
  'x-pixel': 'opaque',
  'snap-pixel': 'opaque',
  'pinterest-tag': 'opaque',
  'linkedin-insight': 'opaque',
  'google-analytics': 'opaque',
  'google-tag-manager': 'opaque',
  'google-ads-conversion': 'opaque',
};
