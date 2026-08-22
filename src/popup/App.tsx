import { useCallback, useEffect, useState } from 'preact/hooks';
import type { SiteReport, UnavailableReport } from '../domain/types';
import type { ProtectionLevel } from '../domain/settings';
import { send } from '../domain/messages';
import { LEVEL_LABELS } from '../analysis/labels';
import { Empty, Mark } from './ui';
import { AskPanel } from './AskPanel';
import { Cookies, ExposurePanel, MayKnow, Recipients, RightNow, Unknowns } from './sections/observed';
import { Consistency, PolicyPanel } from './sections/declared';
import { Protection } from './sections/protection';

type State =
  | { kind: 'loading' }
  | { kind: 'report'; report: SiteReport }
  | { kind: 'unavailable'; report: UnavailableReport }
  | { kind: 'starting' };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    const result = await send({ type: 'get-report' });
    setState(result.status === 'ok' ? { kind: 'report', report: result } : { kind: 'unavailable', report: result as UnavailableReport });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The policy is fetched in the background. Wait for it, then stop — a report
  // that keeps rewriting itself while you read it is worse than a slow one.
  const pending = state.kind === 'report' && state.report.policyPending;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [pending, load]);

  const setProtection = useCallback(
    async (site: string, level: ProtectionLevel | 'inherit') => {
      await send({ type: 'set-site-protection', site, level });
      await load();
    },
    [load]
  );

  if (state.kind === 'loading') return <Skeleton />;
  if (state.kind === 'starting') return <Starting />;
  if (state.kind === 'unavailable') {
    return <Unavailable report={state.report} onGranted={() => setState({ kind: 'starting' })} onDone={load} />;
  }

  const { report } = state;
  return (
    <>
      <header class="header" data-level={report.exposure.overall}>
        <div class="header__mark">
          <Mark title="Veyl" />
        </div>
        <div class="header__text">
          <div class="header__site" title={report.site}>
            {report.site}
          </div>
          <div class="header__label">{LEVEL_LABELS[report.exposure.overall]} EXPOSURE</div>
          <p class="header__headline">{report.exposure.headline}</p>
        </div>
      </header>

      <RightNow exposure={report.exposure} />
      <ExposurePanel exposure={report.exposure} />
      <AskPanel report={report} />
      <MayKnow exposure={report.exposure} />
      <Consistency findings={report.consistency} />
      <Recipients services={report.services} />
      <PolicyPanel policy={report.policy} pending={report.policyPending} />
      <Cookies cookies={report.cookies} />
      <Unknowns exposure={report.exposure} />
      <Protection report={report} onChange={(level) => void setProtection(report.site, level)} />

      <footer class="footer">
        <span>Everything here was worked out on your device.</span>
        <span class="footer__spacer" />
        <button type="button" class="linkish" onClick={() => chrome.runtime.openOptionsPage()}>
          Settings
        </button>
      </footer>
    </>
  );
}

function Skeleton() {
  return (
    <div class="skeleton" aria-busy="true" aria-label="Loading">
      <div class="skeleton__bar" style="width: 55%" />
      <div class="skeleton__bar" style="width: 85%" />
      <div class="skeleton__bar" style="width: 70%" />
    </div>
  );
}

function Starting() {
  return (
    <Empty title="Watching now">
      Veyl is reloading the page so it can see the whole visit from the first request. Open Veyl again in a moment.
    </Empty>
  );
}

function Unavailable({
  report,
  onGranted,
  onDone,
}: {
  report: UnavailableReport;
  onGranted: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (report.status === 'unsupported') {
    return <Empty title="Nothing to look at">{report.reason}</Empty>;
  }

  if (report.status === 'reload-needed') {
    return (
      <div class="gate">
        <h1 class="gate__title">Reload to watch this visit</h1>
        <p class="gate__body">{report.reason}</p>
        <button
          type="button"
          class="button button--primary"
          onClick={async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) await chrome.tabs.reload(tab.id);
            onGranted();
          }}
        >
          Reload {report.site}
        </button>
      </div>
    );
  }

  return (
    <div class="gate">
      <h1 class="gate__title">Analyse {report.site}?</h1>
      <p class="gate__body">
        Veyl asks for access one site at a time, so you always know what it can see. Nothing is sent anywhere —
        Veyl has no server.
      </p>

      <div class="gate__lists">
        <div>
          <h2 class="mini-title">On this site Veyl will see</h2>
          <ul class="plain plain--observed">
            <li>Which other companies the page contacts</li>
            <li>Cookies and browser storage this site uses</li>
            <li>Fingerprinting and cross-site tracking signals</li>
            <li>The site’s own published privacy policy</li>
          </ul>
        </div>
        <div>
          <h2 class="mini-title">Veyl will never</h2>
          <ul class="plain plain--never">
            <li>Send your browsing anywhere</li>
            <li>Keep a record of the pages you visit</li>
            <li>Ask you to make an account</li>
            <li>Read what you type or what a page shows you</li>
          </ul>
        </div>
      </div>

      <button
        type="button"
        class="button button--primary"
        disabled={busy}
        onClick={async () => {
          if (!report.originPattern) return;
          setBusy(true);
          const granted = await chrome.permissions.request({ origins: [report.originPattern] });
          if (!granted) {
            setBusy(false);
            onDone();
            return;
          }
          await send({ type: 'access-changed' });
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) await chrome.tabs.reload(tab.id);
          onGranted();
        }}
      >
        {busy ? 'Asking Chrome…' : `Allow Veyl on ${report.site}`}
      </button>
      <button type="button" class="linkish linkish--block" onClick={() => chrome.runtime.openOptionsPage()}>
        Or turn Veyl on for every site
      </button>
    </div>
  );
}
