/** The control: what Veyl blocks on this site, and what it will never block. */
import type { SiteReport } from '../../domain/types';
import { PROTECTION_DESCRIPTIONS, type ProtectionLevel } from '../../domain/settings';
import { Section } from '../ui';

export function Protection({
  report,
  onChange,
}: {
  report: SiteReport;
  onChange: (level: ProtectionLevel | 'inherit') => void;
}) {
  const { level, inherited, blocked, blockedServices } = report.protection;
  const description = PROTECTION_DESCRIPTIONS[level];

  return (
    <Section title={`Protection on ${report.site}`}>
      <div class="levels" role="group" aria-label="Protection level">
        {(['off', 'balanced', 'strict'] as const).map((option) => (
          <button
            key={option}
            type="button"
            class="level"
            aria-pressed={level === option}
            onClick={() => onChange(option)}
          >
            {PROTECTION_DESCRIPTIONS[option].title}
          </button>
        ))}
      </div>
      <div class="promise">
        {description.does.map((line) => (
          <div key={line} class="promise__line">
            <span class="promise__mark promise__mark--does" aria-hidden="true">
              ✓
            </span>
            <span>{line}</span>
          </div>
        ))}
        {description.keeps.map((line) => (
          <div key={line} class="promise__line">
            <span class="promise__mark promise__mark--keeps" aria-hidden="true">
              ⦿
            </span>
            <span>{line}</span>
          </div>
        ))}
      </div>
      {blocked > 0 && (
        <p class="callout callout--ok">
          Blocked here: {blocked} request{blocked === 1 ? '' : 's'} from {blockedServices.map((s) => s.name).join(', ')}.
          Nothing needed for sign-in or checkout was blocked.
        </p>
      )}
      {!inherited && (
        <button type="button" class="linkish linkish--block" onClick={() => onChange('inherit')}>
          Use my default setting for this site instead
        </button>
      )}
    </Section>
  );
}
