# Architecture

Veyl is built around one rule: **the evidence engine determines facts, and the
explanation layer only phrases them.** Nothing in the interface may assert something
the evidence layer did not record. That rule is what lets the product say "we found no
evidence of fingerprinting" instead of "they don't fingerprint you", and it is why the
judgement code has no license to invent.

```
        YOUR BROWSER                                  EVERYWHERE ELSE
 ┌───────────────────────────────────────┐
 │  page world      isolated world       │            nothing
 │  ┌─────────┐     ┌──────────────┐     │
 │  │  probe  │────▶│  collector   │     │      no account
 │  └─────────┘     └──────┬───────┘     │      no server
 │   API signals            │ messages   │      no telemetry
 │                          ▼            │      no browsing history
 │                 ┌─────────────────┐   │      no policy uploads
 │  webRequest ───▶│ service worker  │   │
 │  cookies    ───▶│                 │   │
 │                 │   visits.ts     │   │
 │                 └────────┬────────┘   │
 │                          ▼            │
 │                     EVIDENCE          │
 │                          │            │
 │        ┌─────────────────┼──────────────────┐
 │        ▼                 ▼                  ▼
 │  tracker graph     policy analyzer    exposure engine
 │  (who is this)     (what they say)    (levels + provenance)
 │        └─────────────────┼──────────────────┘
 │                          ▼
 │                  consistency engine
 │                   (say vs. do)
 │                          │
 │            ┌─────────────┴─────────────┐
 │            ▼                           ▼
 │      popup / settings           protection engine
 │      (explanation)              (declarativeNetRequest)
 └───────────────────────────────────────┘
```

## The three truths, kept separate

| Layer | Question | Where |
|---|---|---|
| Evidence | What actually happened in this browser? | `src/background/visits.ts`, `cookies.ts`, `src/content/` |
| Knowledge | Who is this domain, and what is it for? | `src/knowledge/` |
| Judgement | What does that mean for this person? | `src/analysis/` |

They are separate files because they are separate kinds of claim, and the interface
labels which one it is showing (`Observed` / `Declared` / `Inferred` / `Unknown`).

## Observation

`chrome.webRequest` is used **observationally only** — Manifest V3 removed blocking
webRequest for ordinary extensions, and Veyl does not want it. Every request's URL,
type and tab is recorded; no request or response body is ever read.

`chrome.cookies` is queried for the site you are on and for the third-party domains
this page actually contacted — never the whole cookie jar. Values are inspected in
memory to classify them and are never stored or transmitted.

Two page scripts do what the service worker cannot:

- **`probe.ts`** runs in the page's own JavaScript world at `document_start` and counts
  calls to the APIs used for fingerprinting and cross-site tracking. It always calls
  through to the original and returns the real value: an extension that lies to a page
  is an extension that breaks it.
- **`collector.ts`** runs in the isolated world, validates the probe's output before
  forwarding it (a page controls the page world, so its signals are untrusted input),
  inventories `localStorage` / `sessionStorage` / IndexedDB, finds the policy links,
  and watches for a consent banner so Veyl can tell what loaded before you chose.

`collector.ts` also announces the page at `document_start`. That message is what
guarantees Veyl is awake at all: a message reliably starts a suspended MV3 service
worker, whereas a network event may not, and without it the first page after a browser
restart would go unwatched.

## Progressive permission

The manifest declares **no host permissions**. Because nothing is declared, the page
scripts are registered at runtime with `chrome.scripting.registerContentScripts` and
always match exactly the origins you have granted. The set of sites Veyl can see is the
set you approved, enforced by Chrome.

`src/background/permissions.ts` owns that, and re-syncs on every permission change.

## Protection

Blocking is expressed as `declarativeNetRequest` rules generated from the same
knowledge graph the explanations come from — so what gets blocked is always something
Veyl can name. Chrome enforces the rules without Veyl seeing request contents.

The whole policy is four dynamic rules, not one per tracker. See
[`protection-rules.md`](protection-rules.md).

## Service worker lifetime

MV3 service workers are killed aggressively. Per-visit evidence is held in memory for
speed and mirrored into `chrome.storage.session` (memory-backed, discarded when the
browser closes, never on disk) so a suspended worker loses nothing.

## Where the local model would go

The explanation layer today is deterministic: templates over structured evidence. That
is not a placeholder for a language model, it is the reliable floor beneath one — the
moat is the evidence engine, the tracker graph and the provenance system, not the
model. See [`roadmap.md`](roadmap.md) for where an on-device model earns its place and
where it must not be trusted.
