import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { SiteReport } from '../domain/types';
import { EXPLAINER_INSTRUCTIONS, buildDigest } from '../analysis/digest';
import { availability, createSession, type ModelAvailability, type Session } from '../model/language-model';
import { Section } from './ui';

/**
 * Small models drift into markdown however plainly you ask them not to, and the
 * answer is rendered as plain text. Only paired emphasis and list markers are
 * removed; nothing that would change what was said.
 */
export function asPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|[.,;:!?)]|$)/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '');
}

const SUGGESTIONS = [
  'What should I actually care about here?',
  'Who learns the most about me on this page?',
  'What would turning on protection change?',
  'Explain this page in one sentence',
];

export function AskPanel({ report }: { report: SiteReport }) {
  const [state, setState] = useState<ModelAvailability | 'checking'>('checking');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void availability().then(setState);
    return () => {
      abort.current?.abort();
      session.current?.close();
      session.current = null;
    };
  }, []);

  // The report is rebuilt as evidence arrives; a stale answer would be worse
  // than none, so it is cleared rather than left sitting under new numbers.
  useEffect(() => {
    setAnswer('');
  }, [report.site]);

  const ask = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      setError(null);
      setAnswer('');
      abort.current = new AbortController();
      try {
        if (!session.current) {
          // Chrome takes a good fifteen seconds to spin the model up the first
          // time, which is far too long to sit under the word "Thinking".
          setStarting(true);
          session.current = await createSession(EXPLAINER_INSTRUCTIONS, (fraction) => setProgress(fraction));
          setStarting(false);
        }
        const prompt = `EVIDENCE Veyl gathered for this page:\n\n${buildDigest(report)}\n\nQUESTION: ${text.trim()}`;
        await session.current.ask(prompt, (chunk) => setAnswer((current) => current + chunk), abort.current.signal);
        setAnswer((current) => asPlainText(current));
      } catch (cause) {
        if ((cause as Error)?.name !== 'AbortError') {
          setError('Chrome’s on-device model could not answer that. Everything above still stands on its own.');
        }
      } finally {
        setStarting(false);
        setBusy(false);
      }
    },
    [busy, report]
  );

  // Where Chrome has no model to offer, the popup says nothing at all. A person
  // reading a privacy report does not need to be told about a feature they
  // cannot use; the settings page explains it if they go looking.
  if (state === 'checking' || state === 'unsupported' || state === 'unavailable') return null;

  if (state === 'downloadable' || state === 'downloading') {
    return (
      <Section title="Ask Veyl">
        <p class="muted">
          Ask questions about this page in your own words. Chrome runs the model on this device — your question and
          the evidence never leave it, and Veyl has no server to send them to.
        </p>
        <p class="fineprint">
          Chrome downloads the model once, and it is several gigabytes. Veyl neither ships nor hosts it.
        </p>
        <button
          type="button"
          class="button button--primary ask__enable"
          disabled={state === 'downloading' || busy}
          onClick={() => void ask(SUGGESTIONS[0]!)}
        >
          {state === 'downloading' || busy
            ? `Chrome is downloading the model… ${Math.round(progress * 100)}%`
            : 'Turn on Ask Veyl'}
        </button>
        {error && <p class="callout callout--warn">{error}</p>}
      </Section>
    );
  }

  return (
    <Section title="Ask Veyl">
      <div class="ask__suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" class="ask__chip" disabled={busy} onClick={() => void ask(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      <form
        class="ask__form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
          setQuestion('');
        }}
      >
        <input
          class="ask__input"
          type="text"
          value={question}
          placeholder="Ask about this page…"
          aria-label="Ask about this page"
          onInput={(event) => setQuestion((event.target as HTMLInputElement).value)}
        />
        <button type="submit" class="ask__send" disabled={busy || !question.trim()}>
          Ask
        </button>
      </form>

      {(answer || busy) && (
        <div class="ask__answer" aria-live="polite">
          {answer || (
            <span class="muted">
              {starting ? 'Starting Chrome’s on-device model…' : 'Thinking…'}
            </span>
          )}
          {busy && (
            <button type="button" class="linkish linkish--block" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          )}
        </div>
      )}
      {error && <p class="callout callout--warn">{error}</p>}

      {answer && !busy && (
        <p class="fineprint ask__note">
          Written by Chrome’s on-device model from the evidence above — it cannot see the page, and it decides nothing.
          The levels, the companies and the policy findings all come from what Veyl observed.
        </p>
      )}
    </Section>
  );
}
