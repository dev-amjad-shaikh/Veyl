import { useCallback, useEffect, useState } from 'preact/hooks';
import type { HistoryTotals } from '../domain/types';
import type { ProtectionLevel, Settings } from '../domain/settings';
import { send } from '../domain/messages';
import { PROTECTION_DESCRIPTIONS } from '../background/protection';
import { KNOWLEDGE_VERSION, TRACKER_COUNT } from '../knowledge/graph';
import { ALL_SITE_PATTERNS } from '../background/permissions';
import { CATEGORY_LABELS } from '../analysis/labels';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<HistoryTotals | null>(null);
  const [allSites, setAllSites] = useState(false);
  const [sites, setSites] = useState<string[]>([]);
  const welcome = location.hash === '#welcome';

  const refresh = useCallback(async () => {
    setSettings(await send({ type: 'get-settings' }));
    setHistory(await send({ type: 'get-history' }));
    const granted = await chrome.permissions.getAll();
    const origins = granted.origins ?? [];
    setAllSites(ALL_SITE_PATTERNS.every((pattern) => origins.includes(pattern)));
    setSites(origins.filter((o) => !ALL_SITE_PATTERNS.includes(o)).map(prettyOrigin).sort());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = useCallback(
    async (update: Partial<Settings>) => {
      setSettings(await send({ type: 'update-settings', patch: update }));
    },
    []
  );

  if (!settings) return <div class="shell">Loading…</div>;

  return (
    <div class="shell">
      <h1 class="shell__title">{welcome ? 'Veyl is installed.' : 'Veyl'}</h1>
      <p class="shell__sub">
        Veyl watches what a website actually does with your data and explains it in plain language. It works
        entirely on this device. There is no account, no server, and nothing to opt out of — Veyl has nowhere
        to send your browsing even if it wanted to.
      </p>

      <section class="card">
        <h2 class="card__title">Where Veyl can look</h2>
        <p class="card__body">
          Veyl asked for nothing when you installed it. Give it access one site at a time from the Veyl icon, or
          turn it on everywhere for an always-on privacy indicator.
        </p>
        <div class="toggle-row">
          <div class="toggle-row__text">
            <div class="toggle-row__name">Watch every site</div>
            <div class="toggle-row__hint">
              Chrome will ask for permission to read site data on all websites. That prompt sounds broad because
              Chrome cannot distinguish "reads which trackers loaded" from "reads everything". What Veyl actually
              does with it is described below, and the source is open.
            </div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={allSites}
            aria-label="Watch every site"
            onClick={async () => {
              if (allSites) await chrome.permissions.remove({ origins: ALL_SITE_PATTERNS });
              else await chrome.permissions.request({ origins: ALL_SITE_PATTERNS });
              await send({ type: 'access-changed' });
              await refresh();
            }}
          />
        </div>
        {!allSites && sites.length > 0 && (
          <div class="toggle-row">
            <div class="toggle-row__text">
              <div class="toggle-row__name">Sites you have allowed ({sites.length})</div>
              <div class="toggle-row__hint">{sites.join(' · ')}</div>
            </div>
          </div>
        )}
      </section>

      <section class="card">
        <h2 class="card__title">Protection</h2>
        <p class="card__body">
          What Veyl blocks by default. You can override this for any individual site from the Veyl icon.
        </p>
        <div class="levels" style="max-width: 340px; margin-top: 14px">
          {(['off', 'balanced', 'strict'] as ProtectionLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              class="level"
              aria-pressed={settings.protection === level}
              onClick={() => void patch({ protection: level })}
            >
              {PROTECTION_DESCRIPTIONS[level].title}
            </button>
          ))}
        </div>
        <ul class="plain" style="margin-top: 14px">
          {PROTECTION_DESCRIPTIONS[settings.protection].does.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p class="card__body" style="margin-top: 10px">
          <strong>Never blocked, at any level:</strong> sign-in, payments, bot and fraud protection, cookie
          banners, and content delivery. A privacy tool that breaks your checkout has not protected you.
        </p>

        <div class="toggle-row" style="margin-top: 8px">
          <div class="toggle-row__text">
            <div class="toggle-row__name">Send Global Privacy Control</div>
            <div class="toggle-row__hint">
              Adds a <code>Sec-GPC</code> header telling sites not to sell or share your personal information.
              Legally binding in some places, ignored in others.
            </div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={settings.globalPrivacyControl}
            aria-label="Send Global Privacy Control"
            onClick={() => void patch({ globalPrivacyControl: !settings.globalPrivacyControl })}
          />
        </div>

        <div class="toggle-row">
          <div class="toggle-row__text">
            <div class="toggle-row__name">Read published privacy policies</div>
            <div class="toggle-row__hint">
              Your browser fetches the site's own policy page, without cookies, and Veyl reads it here. The text
              is never uploaded — sending a policy to a server would also reveal the site you were on.
            </div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={settings.policyAnalysis}
            aria-label="Read published privacy policies"
            onClick={() => void patch({ policyAnalysis: !settings.policyAnalysis })}
          />
        </div>
      </section>

      <section class="card">
        <h2 class="card__title">Privacy history</h2>
        <p class="card__body">
          Off unless you turn it on. When on, Veyl keeps <strong>counters only</strong> for the current month:
          how many pages it analysed, how many tracker requests it saw and blocked, and which companies came up.
          It keeps no list of sites, no domains, no hashes of domains, and no timestamps — so there is nothing
          here that could reconstruct where you have been.
        </p>
        <div class="toggle-row">
          <div class="toggle-row__text">
            <div class="toggle-row__name">Keep monthly totals on this device</div>
            <div class="toggle-row__hint">Stored in this browser profile. Never transmitted.</div>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={settings.historyEnabled}
            aria-label="Keep monthly totals"
            onClick={() => void patch({ historyEnabled: !settings.historyEnabled })}
          />
        </div>
        {settings.historyEnabled && history && <HistoryTable history={history} onClear={async () => setHistory(await send({ type: 'clear-history' }))} />}
      </section>

      <section class="card">
        <h2 class="card__title">What leaves this device</h2>
        <p class="card__body">Nothing. Written out properly, because it is the whole product:</p>
        <table class="table" style="margin-top: 14px">
          <thead>
            <tr>
              <th>Data</th>
              <th>Where it lives</th>
            </tr>
          </thead>
          <tbody>
            <Row what="Pages you visit, and their URLs" where="Memory only, per tab. Destroyed when the tab closes." />
            <Row what="Cookies, storage and tracker observations" where="Memory only, per tab. Never written to disk." />
            <Row what="Privacy policies Veyl reads" where="Fetched by your browser from the site. Held in memory for the session." />
            <Row what="Your settings and per-site choices" where="This browser profile." />
            <Row what="Monthly counters (if you turn them on)" where="This browser profile. Counts only." />
            <Row what="Telemetry, crash reports, analytics" where="None. Veyl contains no analytics code." />
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2 class="card__title">Where the judgements come from</h2>
        <p class="card__body">
          Veyl identifies {TRACKER_COUNT} services from a knowledge base compiled from public vendor
          documentation (version {KNOWLEDGE_VERSION}). Every statement in the interface is labelled{' '}
          <strong>Observed</strong>, <strong>Declared</strong>, <strong>Inferred</strong> or{' '}
          <strong>Unknown</strong>, and can be opened to show what it rests on. A domain Veyl does not
          recognise is reported as unidentified rather than guessed at.
        </p>
      </section>
    </div>
  );
}

function Row({ what, where }: { what: string; where: string }) {
  return (
    <tr>
      <td>{what}</td>
      <td style="text-align: right; color: var(--muted)">{where}</td>
    </tr>
  );
}

function HistoryTable({ history, onClear }: { history: HistoryTotals; onClear: () => void }) {
  const companies = Object.entries(history.companies).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const categories = Object.entries(history.categories).sort((a, b) => b[1] - a[1]);
  const share = (n: number) => (history.pagesAnalyzed ? Math.round((n / history.pagesAnalyzed) * 100) : 0);

  if (history.pagesAnalyzed === 0) {
    return <p class="card__body" style="margin-top: 14px">Nothing counted yet this month.</p>;
  }

  return (
    <>
      <table class="table" style="margin-top: 18px">
        <thead>
          <tr>
            <th>{history.month}</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Pages analysed</td><td>{history.pagesAnalyzed.toLocaleString()}</td></tr>
          <tr><td>Tracker requests seen</td><td>{history.trackerRequests.toLocaleString()}</td></tr>
          <tr><td>Requests blocked</td><td>{history.blockedRequests.toLocaleString()}</td></tr>
        </tbody>
      </table>

      {companies.length > 0 && (
        <table class="table" style="margin-top: 22px">
          <thead>
            <tr>
              <th>Companies encountered</th>
              <th>Share of your pages</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(([name, count]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end">
                    <div class="bar" style={`width: ${Math.max(4, share(count) * 0.9)}px`} />
                    <span>{share(count)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {categories.length > 0 && (
        <table class="table" style="margin-top: 22px">
          <thead>
            <tr>
              <th>What kind of tracking</th>
              <th>Times seen</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(([category, count]) => (
              <tr key={category}>
                <td>{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}</td>
                <td>{count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="button" class="button button--danger" style="margin-top: 18px" onClick={onClear}>
        Erase these totals
      </button>
    </>
  );
}

function prettyOrigin(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
}
