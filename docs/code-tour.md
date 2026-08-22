# A tour of the code

Read in this order and the whole thing should make sense in about twenty minutes. Roughly
5,400 lines of TypeScript, no framework beyond Preact, four bundles.

```
src/
  domain/      the vocabulary everything else speaks
  knowledge/   who a domain belongs to and what it is for
  content/     the two scripts that run inside a page
  background/  the service worker: observe, protect, remember
  analysis/    evidence → judgement → the report
  model/       Chrome's on-device model, wrapped thinly
  popup/       the report a person reads
  options/     settings, and the honest account of what is stored
```

## The one rule

> The evidence engine determines facts. The explanation layer only phrases them.

Nothing in `analysis/` or `popup/` may assert something `background/visits.ts` did not
record. That rule is what lets the product say *"we found no evidence of fingerprinting"*
rather than *"they don't fingerprint you"* — and it is why the judgement code has no
licence to invent.

---

## 1. Start here: `domain/types.ts`

The vocabulary. It is deliberately split into three kinds of thing, and the split is the
architecture:

**Evidence** — `VisitEvidence`, `DomainObservation`, `CookieObservation`, `ApiSignal`.
What was actually observed, in this tab, during this visit.

**Knowledge** — `TrackerEntry`, `Organization`, `CookieKnowledge`. What is durably known
about a domain, independent of any page.

**Judgement** — `Provenance`, `ExposureLevel`, `Statement`, `PrivacyExposure`. What that
means for a person, with every claim carrying where it came from.

Two types carry most of the product's honesty:

```ts
type Provenance = 'observed' | 'declared' | 'inferred' | 'unknown';
type ExposureLevel = 'none-seen' | 'low' | 'medium' | 'high' | 'unknown';
```

`none-seen` is not `none`. `unknown` is not `low`. Collapsing either would make Veyl
claim more than it knows, and tests fail if you do.

Also worth reading now: `domain/settings.ts` (three protection levels and what each
does, in the words the interface uses) and `domain/messages.ts` (the whole internal
protocol, one file so every surface agrees).

## 2. `knowledge/` — who is on the other end

`trackers.json` holds 98 services: the domains they own, the company behind them, the
category, what they can learn, and one plain sentence describing them. `organizations.json`
holds companies and their parents, so *Google Analytics* can be shown as *Alphabet
(Google)*. `cookies.json` names 48 cookies.

`graph.ts` resolves a request against all of that. Two rules matter:

- **Most specific wins.** A full hostname beats a parent domain, and an entry that also
  constrains the URL beats one that only owns the domain. That is how
  `google.com/recaptcha` is identified as bot protection while `google.com/pagead` is
  identified as advertising, without either being a guess.
- **No match means no match.** An unrecognised domain comes back `known: false` and stays
  unidentified all the way to the interface.

`blockableDomains()` is the safety-critical function. Three exclusions, each because
including it broke a page someone was using: functional categories, domains shared
between a tracker and something else, and a tracker company's own website and CDN.
See [`protection-rules.md`](protection-rules.md).

## 3. `content/` — the two scripts inside a page

**`probe.ts`** runs in the page's own JavaScript world at `document_start`, before the
site's scripts, and counts calls to the APIs used for fingerprinting. It always calls
through to the original and returns the real value — an extension that lies to a page is
an extension that breaks it. Note the canvas heuristic: a pixel readback only counts as a
signal if text was drawn first, which is the actual fingerprinting technique and keeps
games and image editors out of the report.

**`collector.ts`** runs in the extension's isolated world. It validates the probe's
output before forwarding it — a page controls the page world, so those signals are
untrusted input — inventories browser storage, finds policy links, and watches for a
consent banner so Veyl can tell what loaded before you chose.

`collector.ts` also announces the page at `document_start`. That message is what
guarantees Veyl is awake at all: a message reliably starts a suspended service worker,
where a network event may not.

## 4. `background/` — the service worker

**`index.ts`** is the wiring, and short enough to read top to bottom. `webRequest` for
observation only, `onErrorOccurred` to count what Chrome blocked, message handlers, and
the lifecycle.

**`visits.ts`** owns the evidence for each tab. In memory for speed, mirrored to
`chrome.storage.session` so a suspended worker loses nothing, deleted when the tab closes.

**`cookies.ts`** asks Chrome only about the site you are on and the third-party domains
this page actually contacted — never the whole cookie jar. Values are classified in
memory and never stored.

**`permissions.ts`** is the trust boundary. The manifest declares no host access, so the
page scripts are registered at runtime and always match exactly the origins you granted.

**`protection.ts`** turns the knowledge graph into `declarativeNetRequest` rules. The
whole policy is five rules, not one per tracker. Every block rule carries
`domainType: 'thirdParty'` so a site is never stopped from loading its own files.

**`history.ts`** is worth reading even though it is small: it is counters and nothing
else. No list of sites, no domains, no hashes of domains, no timestamps.

## 5. `analysis/` — evidence becomes judgement

The pipeline, in order:

```
VisitEvidence
   │  inventory.ts    group observations by service and company
   ▼
Inventory
   │  exposure.ts     seven dimensions, each a level plus its statements
   │  policy.ts       fetch and read the site's own policy, locally
   │  consistency.ts  compare the two
   ▼
   report.ts          compose the one object the interface renders
```

**`inventory.ts`** turns raw observations into services, companies, cookies and signals.
`mergeByService` is here: Meta reaches you through two domains, and listing *Meta Pixel*
twice would make the page look worse than it is.

**`exposure.ts`** is the heart. Each dimension accumulates an internal weight, which maps
to a level and is then thrown away — the number never reaches the interface, and a test
asserts that. Every branch appends the `Statement` that justifies it. The method is
documented in [`exposure-method.md`](exposure-method.md).

**`policy.ts`** fetches the site's policy and extracts claims with a pattern lexicon.
Service workers have no DOM parser, so markup is stripped textually. Every claim keeps the
sentence it came from. An explicit denial outranks a contextual mention of the same topic
— otherwise a heading reading "Sale of personal information" contradicts the sentence two
lines below denying it.

**`consistency.ts`** compares the two, cautiously. A discrepancy is reported only when the
policy makes a positive commitment the behaviour contradicts, and the wording distinguishes
selling, sharing and targeted advertising the way the law does.

**`digest.ts`** is the only thing the on-device model is ever shown: conclusions the
deterministic engine already reached, never the URL or page content.

**`labels.ts`** is all the user-facing wording, in one place, so the product speaks with
one voice.

## 6. `popup/` and `options/`

`ui.tsx` holds the primitives: `Disclosure`, `LevelPill`, `Segments`, `StatementList`.
`StatementList` is where "Why is Veyl telling me this?" lives — every claim is one click
from its evidence.

The sections mirror the domain: `sections/observed.tsx` (what Veyl saw),
`sections/declared.tsx` (what the site says, and where they disagree),
`sections/protection.tsx` (the control).

Neither interface imports from `background/`. Shared copy lives in `domain/settings.ts`,
and the knowledge counts come over the message protocol — which is also why the popup
bundle is 37 KB rather than 182 KB.

---

## Build and test

`build.mjs` emits four bundles with esbuild. The service worker is ESM; everything else is
IIFE, because Manifest V3 content scripts cannot be modules.

`tests/promises.test.mjs` guards the promises the product makes to a person — that nothing
functional is blockable, that a site can always load its own files, that an unrecognised
domain stays unrecognised. `tests/honesty.test.mjs` guards the claims it refuses to make.

`e2e/` runs the real build in a real Chrome. `observe.e2e.mjs` walks the whole journey
against a page that contacts Google, Meta, TikTok, Criteo and Stripe for real.
`protection.e2e.mjs` is a regression test for a shipped bug where protection blocked a
site's own scripts. `permission.e2e.mjs` checks the shipped build can see nothing until
you allow it.

## Where to be careful

| If you change… | Then… |
|---|---|
| `FUNCTIONAL_CATEGORIES` | you may break someone's checkout |
| `blockableDomains()` or an entry's `neverBlock` | you may make a site unusable |
| the manifest's permissions | you change what Chrome tells people at install |
| `storage.local` vs `storage.session` | you may write browsing data to disk |
| `digest.ts` | you change what the model is allowed to see |

Every one of those has a test that fails loudly. If you are changing one on purpose,
change the test in the same commit and say why.
