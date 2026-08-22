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

export function Stat({
  value,
  label,
  tone,
}: {
  value: ComponentChildren;
  label: string;
  tone?: 'flag' | 'good';
}) {
  return (
    <div class={`stat${tone ? ` stat--${tone}` : ''}`}>
      <div class="stat__value">{value}</div>
      <div class="stat__label">{label}</div>
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
