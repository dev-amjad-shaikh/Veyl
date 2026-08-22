# Evidence schema

Everything Veyl records about a page visit, and nothing else. Defined in
`src/domain/types.ts`; held in memory and mirrored to `chrome.storage.session`, which
Chrome keeps in memory and discards when the browser closes.

```ts
VisitEvidence {
  visitId, tabId, site, url, title?, startedAt, updatedAt

  consent: { bannerSeen, decidedAt }        // decidedAt is null until you choose

  domains: {                                 // keyed by registrable domain
    [site]: {
      firstSeenAt, requests, kinds[], hosts[]
      serviceIds[]                           // knowledge-graph matches
      beforeConsent                          // first seen before you chose
      blocked                                // refused by Chrome on Veyl's behalf
    }
  }

  cookies: [{ name, domain, thirdParty, session, lifetimeDays?,
              httpOnly, sameSite, looksLikeIdentifier }]

  storage: [{ kind, keys, identifierKeys[] }]   // localStorage / sessionStorage / IndexedDB

  signals: [{ kind, calls, attributedTo?, firstSeenAt }]   // fingerprinting & Privacy Sandbox

  policyLinks: [{ url, label, kind }]
}
```

## What is deliberately absent

- **No cookie values.** Values are inspected in memory to decide whether they look like
  an identifier, and the boolean is what is kept.
- **No storage values.** Only key names, and only for keys whose value looked like an
  identifier.
- **No request or response bodies.** Veyl never reads them; MV3 does not offer them to
  ordinary extensions and Veyl does not want them.
- **No page content.** Nothing is read from the DOM except anchor hrefs for policy
  links and the presence of a consent banner.
- **No history.** When the tab closes, the visit is deleted.

## Signals

A signal is a *capability observed*, not an accusation. `canvas-readback` is only
recorded when text was drawn on the canvas first — that is the fingerprinting
technique, and it keeps games and image editors out of the report. Attribution to a
third-party script is best-effort from the call stack and is capped at three attempts
per signal kind so instrumentation never becomes a performance cost.

Signals arriving from the page world are untrusted input: a page controls that world.
`collector.ts` validates kind, clamps counts and bounds string lengths before
forwarding. A page can suppress its own signals — that is inherent to Manifest V3 and
is why fingerprinting is reported as `NONE SEEN` at medium confidence rather than as a
clean bill of health.

## Aggregate history

If you opt in, one page visit becomes a handful of increments:

```ts
HistoryTotals {
  month, pagesAnalyzed, trackerRequests, blockedRequests,
  companies: { [name]: pagesSeenOn },
  categories: { [category]: timesSeen },
  exposureCounts: { 'none-seen' | low | medium | high | unknown: count }
}
```

There is no site identity anywhere in that structure — see
[`privacy-boundary.md`](privacy-boundary.md).
