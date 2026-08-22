/** The report, section by section. */
import type {
  ConsistencyFinding,
  CookieView,
  PolicyAnalysis,
  PrivacyExposure,
  ServiceView,
  SiteReport,
  Stance,
} from '../domain/types';
import type { ProtectionLevel } from '../domain/settings';
import { DIMENSION_LABELS, LEVEL_LABELS } from '../analysis/labels';
import { PROTECTION_DESCRIPTIONS } from '../background/protection';
import { ConfidencePill, Disclosure, LevelPill, ProvenanceTag, Section, Stat, StatementList } from './ui';

export function ExposurePanel({ exposure }: { exposure: PrivacyExposure }) {
  return (
    <Section title="Privacy exposure">
      <div class="dimensions">
        {exposure.dimensions.map((dimension) => (
          <Disclosure
            key={dimension.dimension}
            tone={dimension.level}
            name={<span class="dimension__name">{DIMENSION_LABELS[dimension.dimension]}</span>}
            meta={<LevelPill level={dimension.level} />}
          >
            <StatementList statements={dimension.statements} />
          </Disclosure>
        ))}
      </div>
      <Disclosure
        name={<span class="dimension__name">Confidence</span>}
        meta={<ConfidencePill confidence={exposure.confidence} />}
      >
        <ul class="plain">
          {exposure.confidenceReasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      </Disclosure>
    </Section>
  );
}

export function RightNow({ exposure }: { exposure: PrivacyExposure }) {
  const { rightNow } = exposure;
  return (
    <Section title="Right now">
      <div class="stats">
        <Stat value={rightNow.cookies} label={`cookies (${rightNow.thirdPartyCookies} third-party)`} />
        <Stat
          value={rightNow.trackingServices}
          label="tracking services"
          tone={rightNow.trackingServices === 0 ? 'good' : undefined}
        />
        <Stat value={rightNow.companies} label="companies contacted" />
        {rightNow.blocked > 0 ? (
          <Stat value={rightNow.blocked} label="requests blocked by Veyl" tone="good" />
        ) : (
          <Stat
            value={rightNow.advertisingDetected ? 'Yes' : 'None seen'}
            label="advertising tracking"
            tone={rightNow.advertisingDetected ? 'flag' : 'good'}
          />
        )}
      </div>
      {rightNow.sessionReplayDetected && (
        <p class="callout callout--warn">
          Your mouse movement, scrolling and clicks on this page can be replayed as a recording.
        </p>
      )}
    </Section>
  );
}

export function MayKnow({ exposure }: { exposure: PrivacyExposure }) {
  if (exposure.mayKnow.length === 0) return null;
  return (
    <Section title="What they may know">
      <ul class="bullets">
        {exposure.mayKnow.map((item) => (
          <li key={item.dataType} class="bullet">
            <span class="bullet__dot" aria-hidden="true" />
            <span>
              {item.label}
              <span class="bullet__because">
                <ProvenanceTag provenance={item.provenance} /> {item.because}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Recipients({ services }: { services: ServiceView[] }) {
  const tracking = services.filter((s) => !s.functional);
  const functional = services.filter((s) => s.functional);
  if (services.length === 0) return null;

  return (
    <Section title={`Who your browser contacted (${services.length})`}>
      {tracking.map((service) => (
        <ServiceRow key={service.key} service={service} />
      ))}
      {functional.length > 0 && (
        <Disclosure
          name={
            <span class="dimension__name">
              {functional.length} service{functional.length === 1 ? '' : 's'} this page needs to work
            </span>
          }
          meta={<span class="tag tag--functional">Kept</span>}
        >
          <ul class="plain">
            {functional.map((service) => (
              <li key={service.key}>
                <strong>{service.name}</strong> — {service.summary}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </Section>
  );
}

function ServiceRow({ service }: { service: ServiceView }) {
  const tone =
    service.category === 'advertising' || service.category === 'session-replay'
      ? 'ad'
      : service.known
        ? undefined
        : 'unknown';
  return (
    <Disclosure
      name={
        <>
          <span class="dimension__name">{service.name}</span>
          {service.parentCompany && service.parentCompany !== service.company && (
            <span class="disclosure__meta"> · {service.parentCompany}</span>
          )}
        </>
      }
      meta={<span class={`tag${tone ? ` tag--${tone}` : ''}`}>{service.categoryLabel}</span>}
    >
      <p>{service.summary}</p>
      {service.dataTypes.length > 0 && (
        <>
          <h4 class="mini-title">What it can learn here</h4>
          <ul class="plain">
            {service.dataTypes.map((item) => (
              <li key={item.type}>{item.label}</li>
            ))}
          </ul>
        </>
      )}
      <h4 class="mini-title">Observed on this page</h4>
      <ul class="plain plain--observed">
        {service.observed.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      {service.unknowns.length > 0 && (
        <>
          <h4 class="mini-title">Not established</h4>
          <ul class="plain plain--unknown">
            {service.unknowns.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {service.company && (
        <p class="fineprint">
          Operated by {service.company}
          {service.parentCompany && service.parentCompany !== service.company ? `, owned by ${service.parentCompany}` : ''}.
          {service.confidence === 'medium' && ' Veyl is moderately confident in this attribution.'}
        </p>
      )}
    </Disclosure>
  );
}

const STANCE_WORDS: Record<Stance, string> = {
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
    <Section title="What the site says" aside={<span class="fineprint">{policy.readingMinutes} min read</span>}>
      <div class="stances">
        <Stance label="Sells your data" value={policy.sells} invert />
        <Stance label="Shares with advertisers" value={policy.sharesForAdvertising} />
        <Stance label="Targeted advertising" value={policy.targetedAdvertising} />
        <Stance label="Says how long it keeps data" value={policy.retention.stance} good />
      </div>

      {policy.collects.length > 0 && (
        <Disclosure name={<span class="dimension__name">What it says it collects</span>} meta={<span class="disclosure__meta">{policy.collects.length}</span>}>
          <ul class="plain">
            {policy.collects.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Disclosure
        name={<span class="dimension__name">Your rights</span>}
        meta={<span class="disclosure__meta">{policy.rights.length || 'none found'}</span>}
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

      <Disclosure name={<span class="dimension__name">Everything Veyl read</span>} meta={<span class="disclosure__meta">{policy.claims.length} claims</span>}>
        <ul class="claims">
          {policy.claims.map((claim, index) => (
            <li key={index}>
              <div>{claim.assertion}</div>
              <blockquote class="finding__quote">“{claim.quote}”</blockquote>
            </li>
          ))}
        </ul>
        {policy.url && (
          <p class="fineprint">
            Read from <a class="linkish" href={policy.url} target="_blank" rel="noreferrer noopener">{policy.url}</a> by your
            browser. Veyl has no server; nothing about this was sent anywhere.
          </p>
        )}
      </Disclosure>
    </Section>
  );
}

function Stance({ label, value, invert, good }: { label: string; value: Stance; invert?: boolean; good?: boolean }) {
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

export function Cookies({ cookies }: { cookies: CookieView }) {
  if (cookies.total === 0) return null;
  return (
    <Section title={`Cookies (${cookies.total})`}>
      <p class="muted">
        {cookies.firstParty} from this site, {cookies.thirdParty} from other companies.
        {cookies.identifiers > 0 && ` ${cookies.identifiers} hold what looks like a unique identifier.`}
      </p>
      {cookies.named.length > 0 && (
        <Disclosure name={<span class="dimension__name">Cookies Veyl can name</span>} meta={<span class="disclosure__meta">{cookies.named.length}</span>}>
          <ul class="plain">
            {cookies.named.map((cookie) => (
              <li key={`${cookie.name}-${cookie.domain}`}>
                <code>{cookie.name}</code> — {cookie.summary}
                {cookie.lifetimeDays !== undefined && (
                  <span class="fineprint"> Expires in {formatDays(cookie.lifetimeDays)}.</span>
                )}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {cookies.unnamed.length > 0 && (
        <Disclosure
          name={<span class="dimension__name">Cookies Veyl cannot name</span>}
          meta={<span class="tag tag--unknown">{cookies.unnamed.length}</span>}
        >
          <p>These are set by the site or a service Veyl does not recognise, so their purpose is unknown.</p>
          <ul class="plain">
            {cookies.unnamed.slice(0, 40).map((cookie) => (
              <li key={`${cookie.name}-${cookie.domain}`}>
                <code>{cookie.name}</code> <span class="fineprint">{cookie.domain}</span>
                {cookie.looksLikeIdentifier && <span class="tag tag--ad">looks like an ID</span>}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </Section>
  );
}

function formatDays(days: number): string {
  if (days >= 365) return `${Math.round((days / 365) * 10) / 10} years`;
  if (days === 0) return 'less than a day';
  return `${days} days`;
}

export function Unknowns({ exposure }: { exposure: PrivacyExposure }) {
  if (exposure.unknowns.length === 0) return null;
  return (
    <Section title="What Veyl cannot tell you">
      <ul class="bullets">
        {exposure.unknowns.map((item, index) => (
          <li key={index} class="bullet">
            <span class="bullet__dot bullet__dot--unknown" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

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
