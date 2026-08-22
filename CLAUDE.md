# Veyl — working notes

A Manifest V3 Chrome extension that explains what a website is doing with your data.
Read [`docs/architecture.md`](docs/architecture.md) before changing anything structural.

## Commands

```bash
npm run build      # → dist/  (load this at chrome://extensions)
npm run watch      # rebuild on change
npm run typecheck
npm test           # behavioural tests over the product's promises
npm run e2e        # real Chrome + real trackers; writes evidence/
```

## The rule that matters

The evidence engine determines facts; the explanation layer only phrases them. Nothing
in `src/analysis/` or `src/popup/` may assert something `src/background/visits.ts` did
not record. Concretely:

- Every user-facing claim carries a `Provenance` (`observed` / `declared` / `inferred` /
  `unknown`) and its supporting evidence.
- `NONE SEEN` is not `NONE`; `UNKNOWN` is not `LOW`. Do not collapse them.
- No numeric privacy score ever reaches the interface. A test enforces this.
- An unrecognised domain stays unrecognised. It never becomes "probably a tracker".
- The on-device model is shown `buildDigest(report)` and nothing else, and its output is
  display-only. If you find yourself parsing what it said, stop.

## Things that will break trust if you change them carelessly

- `FUNCTIONAL_CATEGORIES` in `src/domain/types.ts` decides what can never be blocked.
  Moving a category out of that list can break someone's checkout.
- The manifest requests **no host permissions**. Page scripts are registered at runtime
  for granted origins only (`src/background/permissions.ts`). Do not add
  `host_permissions` back.
- `chrome.storage.local` holds settings and opt-in counters, nothing else. Per-visit
  evidence belongs in `chrome.storage.session`. See `src/background/store.ts`.
- There is exactly one outbound `fetch` in the codebase, in `src/analysis/policy.ts`.
  Adding a second one changes what this product is.

## Layout

```
src/domain/      vocabulary, settings, message protocol
src/knowledge/   the tracker graph (JSON) and its resolver
src/background/  service worker: observation, protection, history, permissions
src/content/     probe (page world) and collector (isolated world)
src/analysis/    inventory → exposure → consistency → report
src/popup/       the report a person reads, and Ask Veyl
src/options/     access, protection, history, and the privacy boundary
```
