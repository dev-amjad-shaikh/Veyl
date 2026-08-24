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

## Considered next

Recorded so the reasoning survives, not as commitments. Each entry names what it
would reuse, because anything needing new infrastructure needs a much better
argument in a project with no server.

### Needs nothing new

**Session recording on a page that takes a card or a password.** Veyl already
identifies session-replay services and already knows what is on the page. A
recorder running on a checkout is a specific, common and serious problem — those
tools capture form fields unless the site explicitly masks them, and sites
routinely forget. Highest severity of anything on this list, and every piece of
evidence is already collected.

**What happens when you hand over an email.** At the moment a signup form
appears, Veyl knows which marketing platform it posts to, what the policy permits,
and that `hubspotutk` or `__kla_id` will link the browsing it has already watched
to the contact record about to be created. Nobody says this at the moment it
matters.

**Read the consent banner before you answer it.** The page probe already runs in
the page's world, where `__tcfapi` lives. How many vendors "accept all" enables,
and how many clicks away "reject all" is, are both knowable before the person
chooses — which is the only time the information is any use.

**Where the form actually posts.** A login form whose action is a different
origin, or plain HTTP, is worth a sentence. Pure observation, no external data.

**Cookie exposure.** `httpOnly`, `sameSite` and `looksLikeIdentifier` are already
recorded, and so is the number of third-party scripts on the page. A stable
identifier readable by every one of them is the mechanism by which one
compromised script becomes account takeover — stated from evidence, without
claiming an incident occurred.

### Needs a shipped index

The tracker graph is the precedent: ship the data, look it up locally, never ask
a server about the site someone is on. Anything here that cannot work that way
should not be built.

**Pre-analysed policies for common sites.** Covers policies behind JavaScript, a
login or an unfriendly CDN, which today become "unknown". Carries change history,
so "this policy changed and here is the sentence that appeared" needs no memory of
where the user has been. Index-derived claims must be labelled as such — read
previously is not the same as read just now.

**Breach history for the companies observed.** The Have I Been Pwned breach
catalogue is key-free, non-personal and CC BY 4.0, so it can ship with
attribution. Its data classes map onto Veyl's own vocabulary, which makes the
useful comparison possible: what a site asks for now, against what it has already
lost. Never "your data was breached" — Veyl cannot know that — and never a causal
claim about tracking. Coverage is thin for ad tech and better for first-party
sites, so it is a feature about the site rather than its trackers.

**Content Credentials.** The honest form of "is this AI" is not detection, which
is unreliable and would be pure guesswork in a product built to refuse guessing.
It is provenance: C2PA manifests are signed, verifiable and increasingly present.
Reporting what a manifest says, and reporting nothing where none exists, is
already Veyl's register. Note that this widens the extension's single purpose and
would need the store listing updated deliberately rather than by drift.

### Rejected

**Detecting AI-generated text.** High false-positive rates, biased against
non-native writers, and inference with no evidence trail — the one thing this
product refuses everywhere else.

**Any per-site lookup against a Veyl server.** It would mean receiving the domains
people visit, which contradicts the privacy policy, the store disclosure and the
only real differentiator.

**Checking whether a person's own data was breached.** Requires an email address
and a server-side query. Not a trade-off worth discussing.

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
  `unavailable` where Chrome has not provisioned the model component, which it does on
  its own schedule. Ask Veyl hides itself rather than pretending. Note that a throwaway
  automation profile always reports `unavailable`, because the drivers disable component
  updates — do not mistake that for a device limitation.
- **The model is slow to start.** Chrome takes roughly fifteen seconds to create the
  first session, then about four seconds an answer. The interface says which of those it
  is waiting on.
- **Knowledge coverage.** 98 services cover the overwhelming majority of real-world
  tracking, but not all of it. Unrecognised domains are reported as unidentified and
  lower Veyl's stated confidence rather than being guessed at.
