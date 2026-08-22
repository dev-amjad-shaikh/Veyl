# Using Veyl

A short tour of what Veyl shows you and what to do with it. Every picture here comes
from a synthetic test page built for this purpose — no real browsing appears in any of
them.

---

## Installing it

1. Download the latest build, or run `npm install && npm run build` in a clone.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder.

Veyl's settings page opens once, explaining what it does. You can reopen it any time by
right-clicking the Veyl icon and choosing **Options**.

---

## Letting Veyl see a site

Veyl asks for nothing when you install it. It genuinely cannot see any website until you
say so — Chrome enforces that, not Veyl.

![Veyl asking permission for one site](images/permission-gate.png)

Open a website, click the Veyl icon, and you will see this. Click **Allow Veyl on
\<site\>**; Chrome asks for permission for that one site, and the page reloads so Veyl
can watch the visit from its very first request.

If you would rather have it always on, open Veyl's settings and turn on **Watch every
site**. Chrome will warn that Veyl can read your data on all websites — that warning is
about what the permission *allows*, not what Veyl does with it. What it actually does is
in [the privacy policy](../PRIVACY.md) and in the source.

> **Tip.** Veyl only sees a page it was watching as it loaded. If you granted permission
> and the report says "reload to watch this visit", that is why.

---

## Reading the report

Click the icon again and the report appears.

![The top of a Veyl report](images/report-top.png)

The top line is the site and its **exposure level** — one of *none seen*, *low*,
*medium*, *high*, or *unknown*. Underneath, one sentence about what that means, then the
counts for what just happened on this page.

The icon in your toolbar carries the same thing at a glance: a coloured badge with the
number of tracking services, or the number of requests blocked when protection is on.

### Exposure, dimension by dimension

![The privacy exposure panel](images/exposure.png)

Seven dimensions, each with its own level. Click any one to open it and see the
statements behind it — and click **"Why is Veyl telling me this?"** under a statement to
see the specific evidence, right down to which domain made how many requests.

Two words are used precisely, and the difference matters:

| | |
|---|---|
| **NONE SEEN** | Veyl was watching and saw nothing. It is not proof that nothing happened. |
| **UNKNOWN** | Veyl could not look, or cannot establish it. It is not a quiet way of saying "low". |

Every statement is tagged with where it came from:

| Tag | Meaning |
|---|---|
| **Observed** | Veyl watched this happen in your browser. |
| **Declared** | The site claims this in its own published policy. |
| **Inferred** | Veyl concluded this from what a known service does. |
| **Unknown** | Veyl cannot establish this and will not guess. |

**Confidence** is the last row, and it is a claim about Veyl rather than about the site.
Open it to see why — usually because some domains were not recognised, or because the
site's policy has not been read.

### What they may know

![What the trackers on a page can learn](images/may-know.png)

The plain-language version: what the services on this page are able to learn about you,
each one tagged with how Veyl knows.

### Who your browser contacted

![The list of services contacted](images/services.png)

Every company your browser reached, most active first. Open any one for what it is, what
it can learn here, exactly what was observed, and — importantly — what that observation
does *not* establish.

Services a page genuinely needs are grouped at the bottom and marked **Kept**. Sign-in,
payments, bot protection, cookie banners and content delivery live there, and Veyl never
blocks them.

### What they say vs what they do

![A discrepancy between policy and behaviour](images/consistency.png)

Veyl fetches the site's own privacy policy — your browser does the fetching, and it is
read on your device — and checks it against what actually happened.

- **Possible discrepancy** — the policy makes a promise the behaviour contradicts.
- **Worth knowing** — not a contradiction, but something you would want to know.
- **Matches the policy** — the site behaved as written, which is often the more
  uncomfortable finding.

Veyl is careful here. It will tell you that advertising trackers loaded and that the
policy permits sharing with advertising partners. It will not tell you the site *sold*
your data, because that turns on contracts no browser extension can see.

### The policy itself

![A summary of the site's privacy policy](images/policy.png)

Four questions answered at a glance, then the collection categories, your rights, and
every claim Veyl extracted with the sentence it came from — so you can check its
reading against the original.

### Cookies

![The cookie inventory](images/cookies.png)

Split into cookies Veyl can name — with what each is for and how long it lasts — and
cookies it cannot, which are reported as unidentified rather than guessed at.

### What Veyl cannot tell you

![The list of things Veyl cannot establish](images/unknowns.png)

A permanent part of the report, not an afterthought. What happens to data after it
leaves your browser, whether a company linked the visit to your identity, what a site
forwards from its own servers — none of that is visible to any extension, and Veyl says
so instead of implying otherwise.

---

## Turning on protection

![The protection control](images/protection.png)

Three levels, set globally in settings and overridable for any single site from here.

| Level | What it does |
|---|---|
| **Watching only** | Explains everything, changes nothing. |
| **Protected** (default) | Blocks advertising, ad measurement and session recording. Strips campaign tracking codes from links you open. Sends Global Privacy Control. |
| **Strict** | Also blocks analytics, tag managers, social tracking and marketing tools. Some chat widgets will not load. |

**Never blocked, at any level:** sign-in, payments, bot and fraud protection, cookie
banners, and content delivery. A privacy tool that breaks your checkout has not
protected you. Nor is a site ever stopped from loading its own files, whatever its
domain is otherwise known for.

When something has been blocked, Veyl tells you exactly what and reminds you that
nothing needed for sign-in or checkout was touched.

> **If a site misbehaves,** set it to **Watching only** from this control. It takes
> effect immediately and Veyl keeps explaining without changing anything.

---

## Asking questions

![Asking Veyl a question](images/ask.png)

Where Chrome provides its built-in on-device model, you can ask about the page in your
own words. Chrome runs the model locally; your question never leaves your computer.

The model is shown a summary of the findings already on your screen — never the page
address, never the page content — and it is there to phrase evidence, not to decide
anything. The levels, the companies and the policy findings all come from what Veyl
observed.

If the panel is not there, Chrome has no model available on your device. Everything else
works exactly the same. Veyl's settings page reports the status.

---

> **The popup feels cramped?** *Open in a tab* at the bottom of the report opens the
> same thing full width, still about the page you were on.

## Settings

![Veyl's settings page](images/settings.png)

- **Where Veyl can look** — per-site access, or all sites.
- **Protection** — your default level, Global Privacy Control, and whether Veyl reads
  published privacy policies.
- **Privacy history** — off unless you turn it on. Counters only, for the current month:
  no list of sites, no domains, no hashes of domains, no timestamps. Erase it in one
  click.
- **What leaves this device** — the full table. The short version is *nothing*.

---

## Worked example

You open a shopping page and the badge shows **7** on an amber background. Clicking
through:

- **Right now** — 6 cookies, 7 tracking services, 5 companies contacted.
- **Advertising: HIGH** — Meta Pixel, Google Ads, Criteo and TikTok Pixel all loaded.
- **What they say vs what they do** — the policy promises only strictly necessary
  cookies before you consent, and seven services had already been contacted before the
  banner was answered. Marked **possible discrepancy**, with the site's own sentence
  quoted next to what was observed.
- **What Veyl cannot tell you** — whether any of those companies connected the visit to
  your identity, and whether anything was legally "sold".

You set protection to **Protected**. Reload, and the badge turns green with the number
of requests blocked; the page still works, because everything the shop needs to run was
left alone.

---

## Questions

Anything unclear, or a site that misbehaves with protection on:
<https://github.com/dev-amjad-shaikh/Veyl/issues>. A note of which site and which level
is enough to act on.
