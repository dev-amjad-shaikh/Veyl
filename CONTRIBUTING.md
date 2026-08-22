# Contributing to Veyl

Thanks for looking. The most useful contributions are usually the least glamorous:
a site that misbehaves with protection on, or a tracker Veyl failed to recognise.

## Getting set up

```bash
npm install && npm run build
```

Load `dist/` at `chrome://extensions` with **Developer mode** on. `npm run watch`
rebuilds on save — content scripts and the popup pick that up on reload, the service
worker needs the refresh button on its card.

Read [`docs/code-tour.md`](docs/code-tour.md) first. Twenty minutes there will save you
an afternoon.

## Before you send a change

```bash
npm run typecheck && npm test && npm run e2e
```

The e2e suite drives a real Chrome and makes real requests to real tracking domains, so
it needs a network connection and takes about thirty seconds.

## The rule that governs everything

> The evidence engine determines facts. The explanation layer only phrases them.

Nothing in `analysis/` or `popup/` may assert something the evidence layer did not
record. In practice:

- Every user-facing claim carries a provenance and the evidence behind it.
- `NONE SEEN` is not `NONE`, and `UNKNOWN` is not `LOW`. Do not collapse them.
- No numeric privacy score ever reaches the interface.
- An unrecognised domain stays unrecognised. It never becomes "probably a tracker".
- Veyl never states that a site sold data. It cannot see the contracts, and it says so.

If a change needs one of those relaxed, it probably needs a different design.

## Reporting a site that breaks

This is the most valuable bug report Veyl can get, and the shape that helps most:

- the site;
- the protection level it was on;
- what broke — blank page, missing images, checkout failed, video would not play.

Protection has broken sites before ([`docs/protection-rules.md`](docs/protection-rules.md)
records how), and each time the fix was to make the block list more precise rather than
smaller.

## Adding a tracker

`src/knowledge/trackers.json`, format documented in
[`docs/tracker-graph.md`](docs/tracker-graph.md). Two fields are safety decisions rather
than taxonomy:

**`category`** — anything in `FUNCTIONAL_CATEGORIES` (sign-in, payment, bot protection,
consent, CDN, hosting) is never counted as tracking and can never be blocked.

**`neverBlock`** — list any domain that is also a website people visit on purpose, or the
CDN serving its content. Veyl will still identify and report the tracker; it just will not
block that domain. Where the tracker has a distinct endpoint on such a domain, put the
path in `blockUrlFilters` instead, and only when you are certain of it.

`summary` is shown to a person. Write it the way you would explain it to someone who has
never heard of a tracking pixel.

Facts only, from public vendor documentation. Veyl does not redistribute third-party
blocklists.

## Style

Match the code around you. A few habits this codebase keeps:

- The main path reads like the operation it performs.
- Comments explain decisions and constraints, never syntax. If a line looks odd, the
  comment should say what would break if you 'fixed' it.
- Domain language in names. `blockableDomains`, not `getFilteredList`.
- Prefer deleting a layer to adding one.

## Tests

Tests here protect promises, not implementation. Before adding one, ask what a person
would lose if it failed. `tests/promises.test.mjs` and `tests/honesty.test.mjs` are the
two files to read for the house style.

One lesson from a bug that shipped: an earlier test checked that a blockable domain had
the right *category*. The category was right; the domain was the problem, and a site went
blank. Assert the behaviour, not the attribute you happen to have to hand.

## Licence

MIT. By contributing you agree your work is published under it.
