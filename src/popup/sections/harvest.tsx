/**
 * What the trackers on this page are set up to read from what you type.
 *
 * Two strengths of evidence, never merged. `Declared` comes from the tracker's
 * own configuration and is readable before a single character is typed.
 * `Observed` means a request left the page carrying a parameter that named a
 * field of personal information — Veyl reads that name and never its value.
 */
import type { HarvestSummary, HarvestView } from '../../domain/types';
import { ProvenanceTag, Section } from '../ui';

function FieldList({ fields }: { fields: { field: string; label: string }[] }) {
  return (
    <ul class="harvest__fields">
      {fields.map((field) => (
        <li key={field.field} class="harvest__field">
          {field.label}
        </li>
      ))}
    </ul>
  );
}

function HarvestRow({ view }: { view: HarvestView }) {
  const blocked = view.observed.length > 0 && view.observed.every((o) => o.blocked);
  const tone = view.observed.some((o) => !o.blocked) ? 'observed' : blocked ? 'blocked' : 'declared';

  return (
    <div class="harvest__row" data-tone={tone}>
      <div class="harvest__head">
        <span class="harvest__name">{view.name}</span>
        {view.company && view.company !== view.name && (
          <span class="harvest__company">{view.company}</span>
        )}
        <span class="harvest__tag" data-tone={tone}>
          {tone === 'blocked'
            ? 'Blocked'
            : tone === 'observed'
              ? 'Sent'
              : `${view.declared.length} field${view.declared.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {view.declared.length > 0 && (
        <p class="harvest__line">
          <ProvenanceTag provenance="declared" /> Configured to collect these from any form here:
          <FieldList fields={view.declared} />
          <span class="harvest__note">
            Read from the tracker's own configuration on this page, not from this site's policy
            {view.accountId ? ` (account ${view.accountId})` : ''}.
          </span>
        </p>
      )}

      {view.observed.length > 0 && (
        <p class="harvest__line">
          <ProvenanceTag provenance="observed" />{' '}
          {blocked ? 'Tried to send' : 'Sent'}{' '}
          {view.observed.map((o) => o.label).join(', ')}
          {blocked ? '. Veyl blocked the request.' : '.'}
          <span class="harvest__note">
            Named by the request itself, in{' '}
            {view.observed.map((o) => o.parameter).join(', ')}. Veyl reads the name of the
            parameter and never its value.
          </span>
        </p>
      )}

    </div>
  );
}

/**
 * Silence, accounted for. A tracker Veyl blocked never ran, so it read nothing;
 * one that ran without publishing its configuration is genuinely unknown. Both
 * are one line, because a page full of rows saying "unknown" would bury the row
 * that says something.
 */
function Quiet({ blocked, opaque }: { blocked: string[]; opaque: string[] }) {
  return (
    <>
      {blocked.length > 0 && (
        <p class="harvest__quiet">
          <ProvenanceTag provenance="observed" /> Veyl blocked {list(blocked)} before{' '}
          {blocked.length === 1 ? 'it' : 'they'} could load, so {blocked.length === 1 ? 'it' : 'they'}{' '}
          read nothing here.
        </p>
      )}
      {opaque.length > 0 && (
        <p class="harvest__quiet">
          <ProvenanceTag provenance="unknown" /> {list(opaque)} can be set up to take what you type
          into a form, but {opaque.length === 1 ? 'does' : 'do'} not publish that setting. Nothing
          was seen leaving this page.
        </p>
      )}
    </>
  );
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function HarvestPanel({ summary }: { summary: HarvestSummary }) {
  const { trackers, blocked, opaque } = summary;
  if (trackers.length === 0 && blocked.length === 0 && opaque.length === 0) return null;
  return (
    <Section title="What this page can read from you">
      <div class="harvest">
        {trackers.map((view) => (
          <HarvestRow key={view.entryId} view={view} />
        ))}
        <Quiet blocked={blocked} opaque={opaque} />
      </div>
    </Section>
  );
}
