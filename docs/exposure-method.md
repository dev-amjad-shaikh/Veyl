# How exposure is decided

Veyl reports a **level** per dimension, never a score. Internally each dimension
accumulates a weight, which is mapped to a level and then thrown away — the number
never reaches the interface, and a test asserts that.

```
weight ≤ 5   → NONE SEEN
weight < 30  → LOW
weight < 60  → MEDIUM
otherwise    → HIGH

no evidence available → UNKNOWN
```

The overall level is the **worst** of the four behavioural dimensions (tracking,
advertising, cross-site activity, fingerprinting). Policy transparency, your control
and retention are reported but do not raise the headline: a well-written policy does
not make the trackers go away.

`src/analysis/exposure.ts` is the whole of it, and every branch appends the statement
that justifies it.

## Dimensions

### Tracking — observed
| Evidence | Weight |
|---|---|
| Each tracking service on the page | +12, capped at 60 |
| Third-party cookies holding an identifier | +18 |
| An identifier in `localStorage` (survives clearing cookies) | +10 |
| A session-recording service | +20 |

### Advertising — observed
| Evidence | Weight |
|---|---|
| One advertising service | 40 |
| Each further advertising service | +12, capped at 85 total |
| Any service whose stated purpose includes behavioural profiling | +15 |

### Cross-site activity — observed
| Evidence | Weight |
|---|---|
| Each distinct company contacted | +16, capped at 70 |
| An identity-resolution service (its business is linking you across sites) | +15 |
| A tag manager or server-side forwarder (redistribution Veyl cannot see) | +12 |

Unidentified domains do not add weight — they lower **confidence** instead. Veyl does
not charge a site for something it could not identify.

### Fingerprinting — observed
| Signal | Weight |
|---|---|
| Canvas read back after text was drawn | 35 |
| Audio processing fingerprint | 30 |
| Font enumeration (20+ `document.fonts.check` calls) | 25 |
| WebGL unmasked vendor/renderer | 20 |
| Camera and microphone enumeration | 15 |
| CPU/memory profile, battery | 10 each |

Halved when every signal came from a payment or bot-protection service, where device
checks are expected. With no signals at all the level is `NONE SEEN` at **medium**
confidence, never high — absence of a signal is weaker evidence than its presence, and
code inside a cross-origin frame is outside what Veyl can watch.

### Policy transparency — declared
`100 − clarity`, where clarity starts at 100 and moves with length, hedging density
(`may`, `such as`, `including but not limited to`), average sentence length, whether
your rights are spelled out, and whether a specific retention period is committed to.
`UNKNOWN` until a policy has actually been read.

### Your control — observed + declared
65 when every tracking service loaded before you made a cookie choice; 35 when tracking
is present; 5 when nothing needed a choice. Then −20 if the policy describes your
rights, +15 if it does not.

### How long they keep it — observed + declared
From the longest cookie lifetime actually held by the browser (Chrome caps this at 400
days regardless of what the site asked for): ≥730d → 80, ≥365d → 60, ≥180d → 40,
≥30d → 25, else 8. Then +15 if the policy never states a retention period, −10 if it
states one.

## Confidence

Reported separately, and it is a claim about Veyl, not about the site.

- **High** — Veyl watched the page from its first request and recognised what it saw.
- **Medium** — more domains were unidentified than identified, or the only evidence is
  an absence.
- **Low** — Veyl was not watching when the page loaded.

The reasons are listed in the interface next to the level, including "the site's
written policy has not been read, so nothing here is checked against it".
