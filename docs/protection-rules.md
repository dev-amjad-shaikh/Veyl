# Protection rules

Blocking is `declarativeNetRequest`: Chrome enforces the rules and Veyl never sees
request contents. The entire policy is **four dynamic rules**, generated from the
knowledge graph in `src/background/protection.ts`.

## Levels

| Level | Blocks |
|---|---|
| **Watching only** | Nothing. Veyl explains and changes nothing. |
| **Protected** (default) | Advertising, ad measurement, session recording. Strips campaign tracking codes from links you open. Sends Global Privacy Control. |
| **Strict** | Also analytics, tag managers, social tracking, personalisation and marketing tools. Some chat widgets will not load. Embedded video is kept — it is the content you came for. |

Any site can override the default, in either direction, from the Veyl icon.

## What can never be blocked

**A page's own requests.** Every block rule carries `domainType: 'thirdParty'`, so a
site is never prevented from loading its own scripts, styles or images. This is not a
nicety: 0.1.0 shipped without it, and visiting a company that also runs a tracker —
facebook.com, reddit.com, x.com — delivered the HTML and blocked everything else, which
is a blank page.

**Anything a site needs to function**, at any level, with no user override:

- sign-in and identity
- payments
- bot and fraud protection
- consent management (the cookie banner itself)
- content delivery and site infrastructure

**A tracker company's own website and CDN.** Meta reaches you through
`connect.facebook.net` *and* `facebook.com`; only the first is safe to block, because
the second is somewhere people go on purpose. Entries mark those domains `neverBlock`,
and `blockableDomains()` drops them. Veyl still reports everything it sees either way.

Where sparing the website would also spare the tracker, the endpoint is blocked by path
instead: `||facebook.com/tr` is Meta's pixel, and blocking it leaves embedded Facebook
content working. Only endpoints Veyl is certain about are listed — a wrong guess here
breaks a page, so the list is short by design.

This is structural rather than a promise in the interface. Four tests fail loudly if a
functional service becomes blockable, if a block rule loses `domainType`, if a
destination domain enters the block list, or if these exclusions quietly gut the block
list. `e2e/protection.e2e.mjs` loads a real page on a blocked domain in a real Chrome and
checks its own scripts still run.

Domains that serve several purposes at once — `google.com` carries both reCAPTCHA and
ad conversion pixels — are excluded from blocking entirely. Veyl can *tell them apart*
for explanation using the request path, but it will not block at that granularity,
because a wrong guess breaks a page.

## Campaign parameters

Stripped from links you open (`main_frame` and `sub_frame` only, so nothing in the
page's own machinery is disturbed): `utm_*`, `gclid`, `gbraid`, `wbraid`, `dclid`,
`fbclid`, `igshid`, `ttclid`, `twclid`, `msclkid`, `li_fat_id`, `mc_eid`, `mc_cid`,
`_hsenc`, `_hsmi`, `yclid`, `epik`, `irclickid`, `s_kwcid` and a few more. These exist
only to tie a click back to you.

## Global Privacy Control

Adds `Sec-GPC: 1`, which is legally binding in some jurisdictions and ignored in
others. On by default, and switchable off.

## Counting what was blocked

Veyl does not guess. When Chrome refuses a request on its behalf, `webRequest`
`onErrorOccurred` fires with `ERR_BLOCKED_BY_CLIENT`, and that is the count shown. So
"6 requests blocked" means six requests the browser really refused.

## Rule shape

Rules use `initiatorDomains` / `excludedInitiatorDomains` so one rule covers every site
rather than one rule per site. With ~150 blockable domains and per-site overrides, the
dynamic rule count stays at five regardless of how many sites you customise.
