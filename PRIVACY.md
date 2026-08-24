# Veyl — Privacy Policy

_Last updated: 22 August 2026_

Veyl is a browser extension that explains what a website is doing with your data. This
policy describes what Veyl does with *your* data, which is the question that matters
more.

## The short version

**Veyl has no server.** There is no account, no login, no backend, and no analytics.
Nothing about your browsing is transmitted anywhere, because there is nowhere for it to
go. The extension makes exactly one outbound network request, and it goes to the
website you are already on, to fetch that site's own published privacy policy.

## What Veyl processes, and where

Everything below happens on your device, in your browser.

| Data | Why Veyl needs it | Where it goes |
|---|---|---|
| The address of the page you are on, and the addresses of the third-party resources it loads | To identify which tracking companies a page contacts | Held in memory for that tab only. Deleted when the tab closes. Never written to disk. |
| Cookie names, domains, expiry dates and flags for the site you are analysing and the domains it contacted | To list the cookies and explain what each is for | Held in memory for that tab only. Cookie **values** are examined in memory to judge whether they look like an identifier, and are never stored, logged or transmitted. |
| The names of keys in the site's `localStorage`, `sessionStorage` and IndexedDB | To detect identifiers that survive clearing your cookies | Held in memory for that tab only. Stored **values** are never retained. |
| Counts of calls to browser APIs used for fingerprinting | To report fingerprinting signals | Held in memory for that tab only. |
| The text of the site's published privacy policy | To summarise what the site says it does | Fetched by your browser from the site, without your cookies. Held in memory for the browsing session. Never uploaded. |
| Your settings and per-site protection choices | To remember what you asked for | Your browser profile, on this device. |
| Monthly totals, **only if you switch them on** | To show you a monthly summary | Your browser profile, on this device. Counters only — see below. |

## What Veyl never does

- It never transmits your browsing history, page addresses, page content, cookies or
  any other personal data to Veyl or to anyone else.
- It never sells or shares your data. There is no data to sell.
- It never builds an advertising profile of you.
- It never reads what you type, and never reads page content beyond link addresses used
  to find the privacy policy and the presence of a cookie banner.
- It never contains analytics, crash reporting or telemetry of any kind, and there is no
  setting that would turn any on.
- It never asks you to create an account.

## Privacy history

Privacy history is **off** until you turn it on. When on, Veyl keeps running totals for
the current calendar month, on your device only:

- how many pages it analysed;
- how many tracker requests it saw, and how many it blocked;
- which companies came up, and on how many of your analysed pages;
- how many pages fell into each exposure level.

It keeps **no list of the sites you visited** — no domains, no hashes of domains, no
addresses, no timestamps and no per-visit records. Nothing stored could reconstruct
where you have been. You can erase the totals at any time from Veyl's settings page, and
they are cleared automatically at the start of each month.

## Ask Veyl and the on-device model

If Chrome provides its built-in on-device language model, Veyl can answer questions
about a page in plain English. Veyl neither ships nor hosts a model: Chrome downloads
and runs it locally on your computer.

The model is given a summary of the findings already shown on your screen — the site
name, the exposure levels, the services detected, the named cookies, what the policy
says, and the list of things Veyl could not establish. It is **not** given the page
address, the page path, the page content, or any access to your browser. Your question
and that summary never leave your device.

## Website access

Veyl requests no access to any website when you install it. You grant access one site at
a time from the Veyl icon, or to all sites from Veyl's settings page if you choose to.
Chrome enforces that boundary. You can withdraw access at any time from
`chrome://extensions` or from Veyl's settings page, and Veyl immediately stops observing
those sites.

## Permissions and why they exist

- **`storage`** — to save your settings and, if you enable it, the monthly totals.
- **`activeTab`** — to see which site you are on when you click the Veyl icon, so Veyl
  can name it and offer to analyse it.
- **`cookies`** — to read cookie metadata for the site you are analysing.
- **`webRequest`** — to observe, never to intercept, which domains a page contacts.
  Veyl cannot and does not read request or response contents.
- **`scripting`** — to run its analysis scripts on sites you have allowed.
- **`declarativeNetRequest`** — to block trackers when you turn protection on. Chrome
  applies these rules; Veyl does not inspect the requests.
- **Host access (optional)** — required by the above to work on a given site. Requested
  from you per site, never at install.

## Children

Veyl is not directed at children and collects nothing from anyone.

## Changes

If this policy changes, the new version will be published here with a new date, and any
change that affects what Veyl does with your data will also appear in the extension's
release notes.

## Contact

Questions or concerns: open an issue at <https://github.com/dev-amjad-shaikh/Veyl>.

Veyl is published on the Chrome Web Store at <https://chromewebstore.google.com/detail/dnedpkkepgoclefdfeblncgfjpmebbno>.
