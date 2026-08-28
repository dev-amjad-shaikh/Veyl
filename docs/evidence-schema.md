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
  links and the presence of a consent banner. Veyl also learns that a form field
  received focus, which is what makes "before you type" possible — an event, not a
  value. It never reads what a field contains.
- **No form values, in any form.** Not the text, not a hash of it, not a length. The
  form-harvest evidence below is built from a tracker's own configuration and from the
  *names* of request parameters.
- **No history.** When the tab closes, the visit is deleted.

## Form harvesting

Two records, kept apart because they are two different strengths of claim.

`HarvestConfig` is what a tracker **declares** it will take. The Meta Pixel keeps its
`selectedMatchKeys` in the page so its own code can read it, so `probe.ts` reads it
there: the field list, and the advertiser's account id so the claim can be checked. No
network request, no new permission. When the configuration cannot be found the answer is
`unknown` — never `none`.

`HarvestTransmission` is what was **observed** leaving: a request URL carrying a
parameter that names a field of personal information. `email_address` (X), `auto_email`
(TikTok), `udff[em]` (Meta, configured through the dashboard), `ud[em]` (Meta, wired up
by hand). Veyl records which parameter carried it and whether protection blocked the
request. It does not record the value, and a value too short or too obviously empty to
be real produces no finding at all.

Silence has two causes and they are never merged: a tracker Veyl **blocked** never ran,
so it read nothing; one that ran without publishing a configuration is genuinely
**unknown**. A page showing seven rows that all said "unknown" would bury the one row
that said something, so the unknowns collapse into a single line.

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
