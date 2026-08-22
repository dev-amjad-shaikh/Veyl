# What is built, and what is not

## Built and working

- **Observation** — requests, cookies (including CHIPS-partitioned), `localStorage`,
  `sessionStorage`, IndexedDB, fingerprinting signals, Privacy Sandbox calls, consent
  banner detection and pre-consent attribution.
- **Tracker knowledge graph** — 98 services, 96 organizations with parent
  relationships, 48 named cookies, path-level disambiguation for shared domains.
- **Policy analysis** — local extraction of claims about collection, sharing, sale,
  targeted advertising, retention, consent, transfers and your rights, each carrying
  the sentence it came from.
- **Say vs. do** — consistency findings graded aligned / worth knowing / possible
  discrepancy, with legally careful wording around "sale".
- **Exposure engine** — seven dimensions, levels not scores, provenance on every
  statement, confidence reported separately.
- **Protection** — three levels, per-site overrides, campaign-parameter stripping,
  Global Privacy Control, and a structural guarantee that functional services are never
  blocked.
- **Progressive permission** — nothing requested at install; page scripts registered
  only into origins you granted.
- **Privacy history** — opt-in, aggregate counters with no site identity.
- **Ask Veyl** — questions in plain English, answered by Chrome's built-in on-device
  model from an evidence digest, appearing only where Chrome can run it.

## Deliberately not built yet

### A model Veyl ships itself

Ask Veyl runs on Chrome's built-in model, which means it is unavailable on machines
where Chrome has not provisioned one — and that is accepted rather than worked around.
Bundling a runtime would cost a multi-gigabyte download, `wasm-unsafe-eval` in the CSP
and a far harder store review, to reach a feature that is by design optional.

The boundary holds either way: the model may **phrase** evidence and answer questions
about it. It may not decide whether a domain is a tracker, whether a policy permits a
sale, or what level a dimension gets. Those stay in the evidence engine, where they can
be tested and where "unknown" is a real answer.

### Cloud policy analysis

Rejected, permanently. Sending a policy to a server also reveals the site you were on.
See [`privacy-boundary.md`](privacy-boundary.md).

### The privacy agent (V3)

Standing preferences — "never allow behavioural advertising, allow basic analytics" —
enforced automatically against consent dialogs. This needs the consent-detection layer
to be considerably more reliable than it is, and getting it wrong means silently
consenting on someone's behalf. Not until the observation layer has been proven on real
sites at scale.

## Known limitations

- **Cross-origin frames.** Code inside a frame Veyl is not injected into is invisible.
  This is why fingerprinting reports `NONE SEEN`, never "none".
- **Server-side forwarding.** A site that collects once in the browser and fans out from
  its own servers is beyond any extension's view. Veyl says so explicitly whenever a tag
  manager or customer data platform is present.
- **The page controls its own world.** A determined site can remove the probe's
  instrumentation. Nothing in Manifest V3 prevents that.
- **`navigator.globalPrivacyControl`.** Veyl sends the `Sec-GPC` header but does not
  define the JavaScript property, because the probe runs before it knows your setting
  and a wrong value would be a lie to the page.
- **The model is not always there.** `LanguageModel.availability()` returns
  `unavailable` on plenty of otherwise capable machines, including an M2 Max with 96 GB
  of RAM, because Chrome provisions the model component on its own terms. Ask Veyl
  hides itself rather than pretending.
- **Knowledge coverage.** 98 services cover the overwhelming majority of real-world
  tracking, but not all of it. Unrecognised domains are reported as unidentified and
  lower Veyl's stated confidence rather than being guessed at.
