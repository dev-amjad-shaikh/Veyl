/** Shared interface primitives. Small, boring, and used everywhere. */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Confidence, ExposureLevel, Provenance, Statement } from '../domain/types';
import { CONFIDENCE_LABELS, LEVEL_LABELS, PROVENANCE_LABELS, PROVENANCE_MEANING } from '../analysis/labels';

export function Section({ title, children, aside }: { title?: string; children: ComponentChildren; aside?: ComponentChildren }) {
  return (
    <section class="section">
      {title && (
        <h2 class="section__title">
          {title}
          {aside && <span class="section__aside">{aside}</span>}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Disclosure({
  name,
  meta,
  children,
  tone,
}: {
  name: ComponentChildren;
  meta?: ComponentChildren;
  children: ComponentChildren;
  tone?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div class="disclosure" data-open={String(open)} data-tone={tone}>
      <button
        type="button"
        class="disclosure__summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span class="disclosure__chevron" aria-hidden="true">
          ▶
        </span>
        <span class="disclosure__name">{name}</span>
        {meta && <span class="disclosure__meta">{meta}</span>}
      </button>
      {open && <div class="disclosure__body">{children}</div>}
    </div>
  );
}

export function LevelPill({ level }: { level: ExposureLevel }) {
  return (
    <span class="pill" data-level={level}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

/**
 * Four discrete steps, deliberately not a bar that fills continuously. Veyl
 * reports levels; a sliding bar would read as a score, which is the thing this
 * product refuses to give.
 */
export function Segments({ level }: { level: ExposureLevel }) {
  return (
    <span class="segments" data-level={level} aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  );
}

/** Veyl's mark: the chevron from the extension icon. */
export function Mark({ title }: { title?: string }) {
  return (
    <svg viewBox="0 0 100 100" role={title ? 'img' : 'presentation'} aria-label={title}>
      <path d="M28 30 L50 74" stroke="currentColor" stroke-width="12" stroke-linecap="round" fill="none" />
      <path
        d="M50 74 L72 30"
        stroke="currentColor"
        stroke-width="12"
        stroke-linecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <span class="pill pill--quiet" title="How much of the picture Veyl actually saw">
      Confidence {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

export function ProvenanceTag({ provenance }: { provenance: Provenance }) {
  return (
    <span class="prov" data-prov={provenance} title={PROVENANCE_MEANING[provenance]}>
      {PROVENANCE_LABELS[provenance]}
    </span>
  );
}

/**
 * Every claim can be opened to show what it rests on. This is the answer to
 * "why is Veyl telling me this?", and it is one click away everywhere.
 */
export function StatementList({ statements }: { statements: Statement[] }) {
  return (
    <ul class="statements">
      {statements.map((statement, index) => (
        <li key={index} class="statement">
          <div class="statement__row">
            <ProvenanceTag provenance={statement.provenance} />
            <span class="statement__text">{statement.text}</span>
          </div>
          {statement.evidence.length > 0 && (
            <details class="statement__evidence">
              <summary>Why is Veyl telling me this?</summary>
              <ul>
                {statement.evidence.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * A small stroked glyph set, drawn on one 16-unit grid so the shapes sit at the
 * same optical weight. They label a row; they never carry meaning on their own,
 * so each one is hidden from assistive technology and the words do the work.
 */
const GLYPHS = {
  cookie: 'M8 2.5a5.5 5.5 0 1 0 5.5 5.5 3 3 0 0 1-3-3 2.5 2.5 0 0 1-2.5-2.5ZM6 7h.01M9.5 9.5h.01M6.5 11h.01',
  eye: 'M1.6 8S3.9 3.8 8 3.8 14.4 8 14.4 8 12.1 12.2 8 12.2 1.6 8 1.6 8Z M8 9.9A1.9 1.9 0 1 0 8 6.1a1.9 1.9 0 0 0 0 3.8Z',
  company: 'M2.5 13.5V4.2l5-2.2v11.5M7.5 13.5h6V6.6l-6-2.4M4.6 6.6h.9M4.6 9h.9M9.9 8.4h1.3M9.9 10.7h1.3',
  shield: 'M8 1.8 3 3.7v4.1c0 3 2.1 5.2 5 6.4 2.9-1.2 5-3.4 5-6.4V3.7L8 1.8Z',
  form: 'M3 2.5h10v11H3zM5.4 5.8h5.2M5.4 8.2h5.2M5.4 10.6h2.8',
  clock: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 4.8V8l2.2 1.4',
} as const;

export function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg class="glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={GLYPHS[name]} fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/**
 * One fact, as a labelled row: what it is on the left, what it says on the
 * right. Reading down the left column tells you what Veyl looked at; reading
 * down the right tells you what it found.
 */
export function Fact({
  icon,
  label,
  children,
  tone,
}: {
  icon: keyof typeof GLYPHS;
  label: string;
  children: ComponentChildren;
  tone?: 'flag' | 'good';
}) {
  return (
    <div class="fact">
      <span class="fact__label">
        <Glyph name={icon} />
        {label}
      </span>
      <span class={`fact__value${tone ? ` fact__value--${tone}` : ''}`}>{children}</span>
    </div>
  );
}


export function Empty({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty__title">{title}</div>
      <div>{children}</div>
    </div>
  );
}
