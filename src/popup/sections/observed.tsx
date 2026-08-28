/**
 * What Veyl saw: the counts, the exposure levels and their evidence, what the
 * observed services could learn, who was contacted, the cookies, and the things
 * Veyl could not establish.
 */
import type { CookieView, PrivacyExposure, ServiceView } from '../../domain/types';
import { DIMENSION_LABELS } from '../../analysis/labels';
import { ConfidencePill, Disclosure, Fact, LevelPill, ProvenanceTag, Section, Segments, StatementList } from '../ui';

export function ExposurePanel({ exposure }: { exposure: PrivacyExposure }) {
  return (
    <Section title="Privacy exposure">
      <div class="dimensions">
        {exposure.dimensions.map((dimension) => (
          <Disclosure
            key={dimension.dimension}
            tone={dimension.level}
            name={DIMENSION_LABELS[dimension.dimension]}
            meta={
              <>
                <Segments level={dimension.level} />
                <LevelPill level={dimension.level} />
              </>
            }
          >
            <StatementList statements={dimension.statements} />
          </Disclosure>
        ))}
      </div>
      <Disclosure name="Confidence" meta={<ConfidencePill confidence={exposure.confidence} />}>
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
      <div class="facts">
        <Fact icon="eye" label="Tracking services" tone={rightNow.trackingServices === 0 ? 'good' : undefined}>
          {rightNow.trackingServices === 0 ? 'None seen' : rightNow.trackingServices}
        </Fact>
        <Fact icon="company" label="Companies contacted">
          {rightNow.companies}
        </Fact>
        <Fact icon="cookie" label="Cookies">
          {rightNow.cookies}
          {rightNow.thirdPartyCookies > 0 && (
            <span class="fact__aside">{rightNow.thirdPartyCookies} third-party</span>
          )}
        </Fact>
        <Fact
          icon="shield"
          label={rightNow.blocked > 0 ? 'Blocked by Veyl' : 'Advertising tracking'}
          tone={rightNow.blocked > 0 || !rightNow.advertisingDetected ? 'good' : 'flag'}
        >
          {rightNow.blocked > 0
            ? `${rightNow.blocked} request${rightNow.blocked === 1 ? '' : 's'}`
            : rightNow.advertisingDetected
              ? 'Yes'
              : 'None seen'}
        </Fact>
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
          name={`${functional.length} service${functional.length === 1 ? '' : 's'} this page needs to work`}
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
          {service.name}
          {service.parentCompany && service.parentCompany !== service.company && (
            <span class="disclosure__sub"> · {service.parentCompany}</span>
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

export function Cookies({ cookies }: { cookies: CookieView }) {
  if (cookies.total === 0) return null;
  return (
    <Section title={`Cookies (${cookies.total})`}>
      <p class="muted">
        {cookies.firstParty} from this site, {cookies.thirdParty} from other companies.
        {cookies.identifiers > 0 && ` ${cookies.identifiers} hold what looks like a unique identifier.`}
      </p>
      {cookies.named.length > 0 && (
        <Disclosure name="Cookies Veyl can name" meta={cookies.named.length}>
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
          name="Cookies Veyl cannot name"
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
