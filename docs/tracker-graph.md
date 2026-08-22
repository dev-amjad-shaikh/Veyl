# The tracker knowledge graph

Veyl does not ask a model whether a domain is dangerous. It looks the domain up in a
curated graph, and if it is not there, it says so.

```
request URL
    │
    ▼
 host + registrable domain
    │
    ▼
TrackerEntry ──── org ────▶ Organization ──── parent ────▶ Organization
    │                                                          │
    ├── category      (advertising, analytics, session-replay…) │
    ├── purposes      (advertising, attribution, profiling…)    │
    ├── dataTypes     (what it can learn, in plain language)    │
    ├── mechanisms    (cookie, pixel, fingerprinting…)          │
    ├── cookies       (names it is known to set)                │
    ├── summary       (one user-facing sentence)                │
    └── confidence    (high | medium)                           │
                                                                ▼
                                              "Alphabet (Google)" on screen
```

Three files, all plain JSON in `src/knowledge/`:

| File | Contents |
|---|---|
| `organizations.json` | Companies and their parents |
| `trackers.json` | 98 services, the domains they own, and what they do |
| `cookies.json` | 48 cookie names Veyl can name with confidence |

## Resolution

Most specific match wins:

1. the full hostname, then each parent suffix up to the registrable domain;
2. within a domain, entries that also constrain the URL beat entries that only own the
   domain.

That second rule is how `google.com/recaptcha/api.js` is identified as bot protection
while `google.com/pagead/1p-conversion/` is identified as advertising — without either
being a guess. Registrable domains come from the real Public Suffix List via `tldts`,
so `bbc.co.uk` is one site and `bbc.co.uk` vs `doubleclick.net` is genuinely
third-party.

An unmatched domain resolves to `known: false` and is reported as **unidentified**. It
never becomes "probably a tracker".

## Adding a service

```json
{
  "id": "example-analytics",
  "domains": ["example-analytics.com", "cdn.example-analytics.net"],
  "urlIncludes": ["/collect"],
  "name": "Example Analytics",
  "org": "example-corp",
  "category": "analytics",
  "purposes": ["analytics"],
  "dataTypes": ["pages-visited", "persistent-id"],
  "mechanisms": ["script", "first-party-cookie"],
  "cookies": ["_exa"],
  "summary": "Records which pages you view so the site can count its visitors.",
  "confidence": "high"
}
```

`summary` is shown to a person, so write it the way you would explain it to someone who
has never heard of the company. `confidence: "medium"` surfaces in the interface as a
caveat on the attribution. `urlIncludes` is only for domains that genuinely serve more
than one purpose; entries carrying it are excluded from blocking, because a wrong guess
there breaks a page.

Categories in `FUNCTIONAL_CATEGORIES` (`cdn`, `hosting`, `authentication`, `payment`,
`fraud-prevention`, `consent-management`) are never counted as tracking and can never
be blocked. Choosing a category is therefore a safety decision, not a taxonomy one.

`neverBlock` is the second safety decision. List any domain that is also a website
people visit on purpose, or the CDN that serves its content — `facebook.com`,
`reddit.com`, `twimg.com`. Veyl will still identify and report the tracker; it just will
not block that domain, because blocking it breaks a page someone was using. Where the
tracker has a distinct endpoint on such a domain, put the path in `blockUrlFilters`
instead, and only when you are certain of it.

## Provenance of the data itself

Compiled by hand from public vendor documentation. No third-party blocklist is
redistributed here — the major open tracker datasets (DuckDuckGo Tracker Radar,
Ghostery TrackerDB) are both CC BY-NC-SA, which would restrict how Veyl can be used,
and neither carries the plain-language `summary` and `dataTypes` the interface needs.
