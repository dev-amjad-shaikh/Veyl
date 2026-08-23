# Veyl

**A privacy agent for the web.** Veyl watches what a website actually does with your
data, reads what it says it does, compares the two, and explains the result in
normal language.

It runs entirely in your browser. There is no account, no server, and no telemetry —
Veyl has nowhere to send your browsing even if it wanted to.

---

## What it does

**Observes** every request a page makes, the cookies and browser storage it uses, and
the browser APIs it touches that are used for fingerprinting and cross-site tracking.

**Identifies** who is on the other end, from a curated knowledge base of tracker
domains, the products that run on them, and the companies that own those products.

**Reads** the site's own published policies — the privacy policy and the separate cookie
policy where there is one, fetched by your browser and parsed on your device — and turns
them into checkable claims.

**Compares** the two. A policy that promises "only strictly necessary cookies before
you consent" while seven marketing services load before you have chosen anything is a
discrepancy, and Veyl shows you the sentence and the evidence side by side.

**Protects**, optionally, by blocking advertising and session-recording services
through Chrome's declarative rules — never sign-in, payments, bot protection or
anything else a page needs to work.

**Answers questions** in plain English, if Chrome's on-device model is available. Veyl
ships no model and hosts none: Chrome runs Gemini Nano locally, and the only thing it
is ever shown is a digest of the evidence already on your screen. It phrases findings.
It does not make them.

## What it refuses to do

Veyl does not give a site a score out of a hundred. A number like *62/100* looks
authoritative and hides how much of the picture was actually visible. Instead every
dimension gets a level, and every level carries its evidence.

Two distinctions do most of the work:

| Veyl says | It means |
|---|---|
| **NONE SEEN** | Veyl was watching, and saw nothing. Not a proof of absence. |
| **UNKNOWN** | Veyl could not look, or cannot establish it. Not a synonym for "low". |

And every statement in the interface is labelled with where it came from:

| Label | Meaning |
|---|---|
| **Observed** | Veyl watched it happen in your browser. |
| **Declared** | The site states it in its own published policy. |
| **Inferred** | Veyl concluded it from what a known service is for. |
| **Unknown** | Veyl cannot establish it and will not guess. |

So Veyl will tell you that advertising trackers loaded and that the policy permits
sharing with advertising partners. It will not tell you the site *sold your data* —
that turns on contracts no browser extension can see, and it says so.

## The model, if you turn it on

Ask Veyl appears only when `LanguageModel.availability()` says Chrome can run its
built-in model (Chrome 138+, and Chrome downloads several gigabytes the first time any
origin asks). Everything else in Veyl works without it, which is the point: the
deterministic explanation layer is the floor, not a fallback.

The boundary is enforced in code and in tests. The model receives
`buildDigest(report)` — the site name, the levels, the services, the named cookies, the
policy stances and the list of things Veyl could not establish. It does not receive the
URL, the page path, the page content, or any browser access. Its instructions forbid
inventing a company, upgrading "none seen" to "none", or claiming a site sold anything.

## Permissions

Veyl requests **no website access when you install it**. Chrome's install prompt is
the moment a privacy product either earns trust or loses it.

You grant access one site at a time from the Veyl icon, or turn it on everywhere from
the settings page once you have decided it deserves that. Nothing is registered into
any page you have not allowed — enforced by Chrome, not by our good intentions.

## What is stored

| Data | Where it lives |
|---|---|
| Pages you visit and their URLs | Memory only, per tab. Destroyed when the tab closes. |
| Cookies, storage and tracker observations | Memory only, per tab. Never written to disk. |
| Privacy policies Veyl reads | Fetched by your browser. Held in memory for the session. |
| Your settings and per-site choices | This browser profile. |
| Monthly counters, if you opt in | This browser profile. Counts only — no sites, no domains, no hashes, no timestamps. |
| Telemetry, crash reports, analytics | None. There is no analytics code in this extension. |

## Install it

```bash
npm install && npm run build
```

Then load `dist/` at `chrome://extensions` with Developer mode on.

## Verify it

```bash
npm test
```

Behavioural tests over the promises the product makes — that nothing functional is
ever blockable, that a clean page reads "none seen" rather than "none", that an
unrecognised domain stays unrecognised, that no numeric score reaches the interface.

```bash
npm run e2e
```

A real Chrome, the real built extension, and a page that contacts Google, Meta,
TikTok, Criteo, Hotjar and Stripe for real. It checks what Veyl saw, what it blocked,
what it read from the policy, what the popup renders, and that the report is usable by
keyboard — and writes screenshots of the result for you to look at.

```bash
npm run smoke
```

Loads real websites twice — once watching only, once protected — and compares the two
renderings. A site that loses its content when protection is on is the failure this
catches, because it is the one that shipped once.

## Using it

[`docs/user-guide.md`](docs/user-guide.md) is a short illustrated tour: granting access to
a site, reading the report, what the levels and provenance tags mean, turning on
protection, and asking questions.

## How it is put together

New to the code? [`docs/code-tour.md`](docs/code-tour.md) walks the whole thing in reading
order. [`docs/architecture.md`](docs/architecture.md) is the shape of it. The parts that a person
should be able to check for themselves are documented separately and deliberately:

- [`docs/evidence-schema.md`](docs/evidence-schema.md) — everything Veyl records, and for how long
- [`docs/tracker-graph.md`](docs/tracker-graph.md) — the knowledge base format and how to extend it
- [`docs/exposure-method.md`](docs/exposure-method.md) — exactly how each level is decided
- [`docs/protection-rules.md`](docs/protection-rules.md) — what is blocked, what can never be
- [`docs/privacy-boundary.md`](docs/privacy-boundary.md) — the line between this device and everywhere else
- [`docs/roadmap.md`](docs/roadmap.md) — what is built, and what is deliberately not built yet
- [`PRIVACY.md`](PRIVACY.md) — the privacy policy, in the same plain language as the product
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to set up, what to test, and the rule that governs changes

## The site

`site/` is the project's website — a static page and the privacy policy, no build step.
Open `site/index.html` directly, or drop the folder on any host. It loads nothing from a
third party: the fonts are served from the same origin, and there is no analytics, because
Veyl would have flagged its own site otherwise.

## Licence

MIT. The tracker knowledge base is compiled from public vendor documentation; no
third-party blocklist is redistributed here.
