# The local/cloud boundary

There is no cloud.

That is not a slogan about intent; it is a property of the build. Veyl contains exactly
one outbound network call, and you can find it:

```
src/analysis/policy.ts → fetchPolicy()
```

It fetches the site's **own published privacy policy** from the site itself, with
`credentials: 'omit'` so none of your cookies go with it. The response is parsed on
your device. Nothing about which policy you read is written to disk.

Grep the source for `fetch(`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` and that is
the only result. There is no analytics SDK, no crash reporter, no feature telemetry,
and no opt-in that would add one.

## Why policy analysis is local even though policies are public

A privacy policy is public. The *request for it* is not:

```
POST /analyze
{ "url": "fertility-clinic.example/...", "policy": "..." }
```

That request has leaked the browsing context, which is the sensitive part. The same
applies to health, finance, politics, employment and adult sites. So the analysis stays
here, where the browsing context already is.

## The on-device model

Ask Veyl uses Chrome's built-in Gemini Nano through `LanguageModel`. That choice is a
privacy decision before it is a technical one:

- **Veyl ships no weights and hosts no model.** Chrome downloads it, on its own
  schedule, for the whole browser. Nothing about that download involves us.
- **Inference is local.** The question and the evidence never leave the device. There
  is no API key in this codebase because there is no API.
- **The model sees a digest, not your browsing.** `src/analysis/digest.ts` builds it
  from the report: site name, levels, services, named cookies, policy stances, and the
  list of things Veyl could not establish. Not the URL, not the path, not page content.
  An end-to-end test asserts the page URL never reaches the prompt.

A bundled runtime such as WebLLM was rejected: it would mean a multi-gigabyte weight
download from somewhere, `wasm-unsafe-eval` in the content security policy, and a much
harder argument to make to anyone auditing this.

## What is written to disk

| Key | Contents | Lifetime |
|---|---|---|
| `settings` | Protection level, per-site overrides, feature toggles | Until you change it |
| `history` | Monthly counters, if you opted in | Current month; erasable in one click |

`chrome.storage.session` holds per-visit evidence: Chrome keeps it in memory and
discards it when the browser closes. It is never written to disk.

## What privacy history does *not* contain

No list of sites. No domains. No hashes of domains. No timestamps. No per-visit rows.

An earlier design stored salted hashes of each site so a site could be counted once.
That is still a record of where you have been, protected only by a secret sitting in
the same profile — so it was removed. Counters increment per analysed page instead, and
a company's share is reported as "appeared on N% of the pages you analysed", which
needs no memory of which pages those were.

## What Chrome's permission prompt will say

If you turn on "watch every site", Chrome will warn that Veyl can *read and change all
your data on all websites*. That prompt is accurate about the capability and useless
about the intent — Chrome cannot distinguish "reads which trackers loaded" from "reads
everything you type".

Veyl's answer to that is structural rather than rhetorical: ask for nothing at install,
grant per site, register page scripts only into granted origins, keep the source
readable, and document the boundary here so it can be checked rather than believed.
