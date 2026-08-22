# Protection rules

Blocking is `declarativeNetRequest`: Chrome enforces the rules and Veyl never sees
request contents. The entire policy is **four dynamic rules**, generated from the
knowledge graph in `src/background/protection.ts`.

## Levels

| Level | Blocks |
|---|---|
| **Watching only** | Nothing. Veyl explains and changes nothing. |
| **Protected** (default) | Advertising, ad measurement, session recording. Strips campaign tracking codes from links you open. Sends Global Privacy Control. |
| **Strict** | Also analytics, tag managers, social embeds, personalisation and marketing tools. Some embedded videos and chat widgets will not load. |

Any site can override the default, in either direction, from the Veyl icon.

## What can never be blocked

Never, at any level, no exceptions and no user override:

- sign-in and identity
- payments
- bot and fraud protection
- consent management (the cookie banner itself)
- content delivery and site infrastructure

This is structural rather than a promise in the interface. `blockableDomains()` filters
these categories out before a rule can be generated, and two tests fail loudly if a
functional service ever becomes blockable. A privacy tool that breaks your checkout has
not protected you.

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
rather than one rule per site. With ~170 blockable domains and per-site overrides, the
dynamic rule count stays at four regardless of how many sites you customise.
