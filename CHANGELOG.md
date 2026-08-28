# Changelog

## 1.1.3

**High exposure says so on the page.** A three-pixel line at the top of the page turned
out to be too quiet to notice. A page Veyl rates high now gets a note in the corner
saying so, what made it high — fingerprinting, cross-site activity, how long the data is
kept — and the counts behind it.

Close it with the × or the Escape key and it stays closed on that page; the thin line
remains as the quiet version of the same fact. "Not on this site" removes both until you
restart your browser.

## 1.1.2

**The icon shows the level again.** The badge only ever carried a *count* — trackers
seen, or requests blocked. A page can be high exposure with nothing to count: no
third-party trackers, nothing blocked, and fingerprinting or data retention driving the
level. LinkedIn is exactly that page. With no count the badge text was empty, and Chrome
draws no badge at all when the text is empty — so the colour that carries the level never
appeared, and the tooltip claimed "nothing here followed you" on a page rated high.

The icon now carries a mark whenever the level is medium or high, whether or not there is
anything to count, and the tooltip leads with the level.

**Clicking the icon can name the site again.** Opening the panel from the toolbar had
been set up so that Chrome opened the panel *instead of* delivering the click — and that
click is what grants `activeTab`. Without it Veyl could not read the address of the tab
it was being asked about, so on any site it had not already been given access to it could
only say "there is no website open in this tab". The permission prompt was unreachable.
The panel is now opened from the click itself, which keeps the grant.

## 1.1.1

**Fixes the indicator going quiet.** The toolbar badge and the on-page hairline were
worked out once, about a second after the page started loading, and then never looked at
again. Most of what a page does happens after that moment, so on a heavy site the
indicator could sit empty while Veyl had plenty to report — you had to open the panel to
find out.

Veyl now takes a fresh look whenever the page contacts a company it has not seen before,
and again when the page finishes loading. The wait is capped, so a page that keeps
contacting new companies cannot keep pushing the indicator back indefinitely.

Updating the extension also leaves every open tab with a content script Chrome has
disconnected. The toolbar indicator now comes back by itself after an update; the
on-page notice still needs those tabs reloaded.

## 1.1.0

**What this page can read from you.** Advertising pixels can be configured to lift your
email address, name, phone number, postcode and date of birth out of any form on a page.
Veyl now reads that setting — from the tracker's own configuration, before you type
anything — and says which fields it is set up to take.

It also watches for the other half: a request leaving the page with a parameter that
*names* personal data, such as `email_address` or `udff[em]`. Veyl reads the name of the
parameter and never its value.

What a tracker declared and what was seen leaving are reported separately, because they
are different claims. A tracker Veyl blocked is reported as blocked, not as unknown — it
never ran, so it read nothing.

**The report is now a side panel.** Clicking the Veyl icon opens a panel beside the page
instead of a popup card. It stays open while you browse and follows you from page to
page, so the report is something you can glance at rather than something you fetch.
*Open in a tab* still gives you the full-width version, pinned to one page.

**Veyl can mark the page itself.** A three-pixel hairline along the top carries the
exposure level, and a card appears for one of two findings: a tracker here is set up to
read what you type, or something personal was seen leaving. Both are off for anything
below high exposure by default, both can be silenced per site, and both can be turned
off entirely under *On the page* in Settings. Neither moves the page's layout, and the
card sits above a site's own cookie banner rather than covering it.

**Also:** `analytics-ipv6.tiktokw.us`, which carries TikTok's advanced-matching data, is
now recognised and blockable.

### Upgrading from 1.0.0

The toolbar icon opens a side panel rather than a popup. Nothing else about how Veyl
works has changed: it still asks for no host permissions at install, still keeps
per-visit evidence in memory only, and still has no server to send anything to.

## 1.0.0

First release.
