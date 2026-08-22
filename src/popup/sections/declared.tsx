/**
 * What the site says, and where that disagrees with what it did.
 *
 * The two are kept in one file because the comparison is meaningless without the
 * claims it compares against.
 */
import type { ConsistencyFinding, PolicyAnalysis, Stance as StanceValue } from '../../domain/types';
import { Disclosure, Section } from '../ui';

const STANCE_WORDS: Record<StanceValue, string> = {
  yes: 'Yes',
  conditional: 'In some circumstances',
  no: 'No',
  unstated: 'Not stated',
};

export function PolicyPanel({ policy, pending }: { policy: PolicyAnalysis | null; pending: boolean }) {
  if (pending && !policy) {
    return (
      <Section title="What the site says">
        <p class="muted">Reading the site’s privacy policy in your browser…</p>
      </Section>
    );
  }
  if (!policy) return null;
  if (policy.status !== 'ok') {
    return (
      <Section title="What the site says">
        <p class="muted">
          {policy.status === 'not-found'
            ? 'Veyl could not find a privacy policy linked from this page.'
            : 'Veyl found a policy but could not read it.'}{' '}
          Everything above rests on what was observed, not on what the site claims.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="What the site says"
      aside={
        <span class="fineprint">
          {policy.sources.length > 1 ? 'privacy + cookie policy · ' : ''}
          {policy.readingMinutes} min read
        </span>
      }
    >
      <div class="stances">
        <Stance label="Sells your data" value={policy.sells} invert />
        <Stance label="Shares with advertisers" value={policy.sharesForAdvertising} />
        <Stance label="Targeted advertising" value={policy.targetedAdvertising} />
        <Stance label="Says how long it keeps data" value={policy.retention.stance} good />
      </div>

      {policy.cookieCategories.length > 0 && (
        <p class="muted" style="margin-bottom: 10px">
          It divides its cookies into: {policy.cookieCategories.join(', ')}.
        </p>
      )}

      {policy.collects.length > 0 && (
        <Disclosure name="What it says it collects" meta={policy.collects.length}>
          <ul class="plain">
            {policy.collects.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Disclosure
        name="Your rights"
        meta={policy.rights.length || 'none found'}
      >
        {policy.rights.length > 0 ? (
          <ul class="plain">
            {policy.rights.map((right) => (
              <li key={right}>You can {right}.</li>
            ))}
          </ul>
        ) : (
          <p>Veyl found no statement of your rights in this policy.</p>
        )}
      </Disclosure>

      <Disclosure name="Everything Veyl read" meta={`${policy.claims.length} claims`}>
        <ul class="claims">
          {policy.claims.map((claim, index) => (
            <li key={index}>
              <div>{claim.assertion}</div>
              <blockquote class="finding__quote">“{claim.quote}”</blockquote>
            </li>
          ))}
        </ul>
        {policy.sources.length > 0 && (
          <p class="fineprint">
            Read by your browser from{' '}
            {policy.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 && ' and '}
                <a class="linkish" href={source.url} target="_blank" rel="noreferrer noopener">
                  the {source.kind === 'cookies' ? 'cookie policy' : 'privacy policy'}
                </a>
              </span>
            ))}
            . Veyl has no server; nothing about this was sent anywhere.
          </p>
        )}
      </Disclosure>
    </Section>
  );
}

function Stance({ label, value, invert, good }: { label: string; value: StanceValue; invert?: boolean; good?: boolean }) {
  const concerning = invert ? value === 'yes' || value === 'conditional' : good ? value === 'unstated' : value === 'yes';
  const unknown = value === 'unstated';
  return (
    <div class="stance" data-tone={unknown ? 'unknown' : concerning ? 'warn' : 'ok'}>
      <span class="stance__label">{label}</span>
      <span class="stance__value">{STANCE_WORDS[value]}</span>
    </div>
  );
}

const SEVERITY_WORDS = {
  discrepancy: 'Possible discrepancy',
  note: 'Worth knowing',
  aligned: 'Matches the policy',
} as const;

export function Consistency({ findings }: { findings: ConsistencyFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <Section title="What they say vs what they do">
      {findings.map((finding, index) => (
        <div key={index} class={`finding finding--${finding.severity}`}>
          <span class="finding__badge">{SEVERITY_WORDS[finding.severity]}</span>
          {finding.saysIsQuote ? (
            <div class="finding__quote">“{finding.says}”</div>
          ) : (
            <div class="finding__says">{finding.says}</div>
          )}
          <div class="finding__observed">{finding.observed}</div>
          <div class="finding__why">{finding.explanation}</div>
        </div>
      ))}
    </Section>
  );
}
