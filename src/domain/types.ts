/**
 * Veyl's domain vocabulary.
 *
 * Three separable truths, kept separable on purpose:
 *   Evidence  — what we actually observed in this browsing session.
 *   Knowledge — what is durably known about a tracker domain (curated, versioned).
 *   Judgement — risk and explanation, derived from the two above.
 *
 * Nothing in the judgement layer may assert a fact the evidence layer did not
 * observe. That rule is what lets the product say "we found no evidence of X"
 * instead of "they don't do X".
 */

/** A registrable domain (eTLD+1), e.g. "example.co.uk". */
export type Site = string;

// ---------------------------------------------------------------------------
// Knowledge: the tracker graph
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  'advertising',
  'analytics',
  'session-replay',
  'tag-manager',
  'social',
  'personalization',
  'customer-engagement',
  'consent-management',
  'fraud-prevention',
  'authentication',
  'payment',
  'cdn',
  'hosting',
  'unknown',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories a site genuinely needs to function. Veyl never blocks these. */
export const FUNCTIONAL_CATEGORIES: readonly Category[] = [
  'cdn',
  'hosting',
  'authentication',
  'payment',
  'fraud-prevention',
  'consent-management',
];

export type Purpose =
  | 'service-operation'
  | 'analytics'
  | 'personalization'
  | 'advertising'
  | 'attribution'
  | 'behavioral-profiling'
  | 'audience-building'
  | 'security';

/** Things a tracker may learn. Phrased as user-visible consequences, not jargon. */
export type DataType =
  | 'pages-visited'
  | 'products-viewed'
  | 'search-terms'
  | 'approximate-location'
  | 'device-info'
  | 'browser-fingerprint'
  | 'advertising-id'
  | 'persistent-id'
  | 'hashed-identity'
  | 'purchases'
  | 'session-recording'
  | 'form-input';

export type Mechanism =
  | 'third-party-cookie'
  | 'first-party-cookie'
  | 'local-storage'
  | 'pixel'
  | 'script'
  | 'fingerprinting'
  | 'server-side-forwarding';

export interface Organization {
  id: string;
  name: string;
  /** Organization id of the ultimate parent, when different. */
  parent?: string;
  country?: string;
  privacyPolicy?: string;
}

export interface TrackerEntry {
  /** Stable identifier, e.g. "google-analytics". */
  id: string;
  /**
   * Hostnames or registrable domains this entry owns. A value with more labels
   * than the registrable domain (e.g. "adservice.google.com") only matches that
   * host and its subdomains.
   */
  domains: string[];
  /**
   * Optional refinement for shared domains: the request URL must contain one of
   * these substrings. Entries carrying it are matched before plain domain
   * entries, which is how google.com/recaptcha is told apart from google.com/pagead.
   */
  urlIncludes?: string[];
  /**
   * Domains that are also a real website or the CDN serving its content, and so
   * must never be blocked even though this entry is a tracker. Meta reaches you
   * through connect.facebook.net *and* facebook.com; only the first is safe to
   * block. Veyl still reports everything it sees either way.
   */
  neverBlock?: string[];
  /**
   * Tracking endpoints on a domain that is otherwise unsafe to block wholesale.
   * Sparing facebook.com keeps embeds working but would also spare Meta's pixel,
   * so the pixel's own path is blocked instead. declarativeNetRequest urlFilter
   * syntax; only endpoints Veyl is certain about belong here.
   */
  blockUrlFilters?: string[];
  /** Product name as a person would recognise it, e.g. "Meta Pixel". */
  name: string;
  org: string;
  category: Category;
  purposes: Purpose[];
  dataTypes: DataType[];
  mechanisms?: Mechanism[];
  /** Cookie names this service is known to set. Used to attribute cookies. */
  cookies?: string[];
  /** One line, user-facing, describing what this service does. */
  summary: string;
  /** How sure we are that this attribution is correct. */
  confidence: 'high' | 'medium';
}

/** Known cookie name → what it is for. */
export interface CookieKnowledge {
  /** Exact name, or a prefix ending in "*". */
  name: string;
  service: string;
  category: Category;
  dataTypes: DataType[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Evidence: what we observed
// ---------------------------------------------------------------------------

export type RequestKind = 'script' | 'image' | 'xhr' | 'frame' | 'font' | 'stylesheet' | 'ping' | 'other';

export interface DomainObservation {
  domain: Site;
  firstSeenAt: number;
  requests: number;
  kinds: RequestKind[];
  /** Hostnames seen under this registrable domain. */
  hosts: string[];
  /** Ids of knowledge-graph entries matched by requests to this domain. */
  serviceIds: string[];
  /** True when at least one request carried a cookie-bearing credentialed load. */
  setCookie: boolean;
  /** Observed before the user interacted with any consent UI on this page. */
  beforeConsent: boolean;
  blocked: number;
}

export interface CookieObservation {
  name: string;
  domain: string;
  /** The cookie's domain is not the page's site. */
  thirdParty: boolean;
  session: boolean;
  /** Days until expiry, rounded. Undefined for session cookies. */
  lifetimeDays?: number;
  httpOnly: boolean;
  sameSite: string;
  /** True when the cookie's value looks like a stable unique identifier. */
  looksLikeIdentifier: boolean;
}

export type StorageKind = 'localStorage' | 'sessionStorage' | 'indexedDB';

export interface StorageObservation {
  kind: StorageKind;
  keys: number;
  /** Keys whose values look like stable identifiers. */
  identifierKeys: string[];
}

/**
 * A browser API whose use is a fingerprinting or cross-site-tracking signal.
 * Observing a call is not proof of fingerprinting — many are used legitimately —
 * so signals carry weight, and the UI says "signals", never "they fingerprint you".
 */
export type ApiSignalKind =
  | 'canvas-readback'
  | 'webgl-parameters'
  | 'audio-fingerprint'
  | 'font-enumeration'
  | 'device-enumeration'
  | 'battery'
  | 'hardware-profile'
  | 'topics-api'
  | 'protected-audience'
  | 'attribution-reporting'
  | 'storage-access';

export interface ApiSignal {
  kind: ApiSignalKind;
  calls: number;
  /** Registrable domain of the script that made the call, when attributable. */
  attributedTo?: Site;
  firstSeenAt: number;
}

/** Everything Veyl observed for one page visit. Lives only in memory + session storage. */
export interface VisitEvidence {
  visitId: string;
  tabId: number;
  site: Site;
  url: string;
  title?: string;
  startedAt: number;
  updatedAt: number;
  /** When a consent banner was detected, and whether a choice was made. */
  consent: { bannerSeen: boolean; decidedAt: number | null };
  domains: Record<Site, DomainObservation>;
  cookies: CookieObservation[];
  storage: StorageObservation[];
  signals: ApiSignal[];
  /** Candidate privacy/cookie policy URLs found on the page. */
  policyLinks: PolicyLink[];
}

export interface PolicyLink {
  url: string;
  label: string;
  kind: 'privacy' | 'cookies' | 'terms' | 'do-not-sell';
}


// ---------------------------------------------------------------------------
// Provenance — Veyl's core design language
// ---------------------------------------------------------------------------

/**
 * Every statement Veyl puts in front of a person carries one of these.
 *
 *   observed  — Veyl saw it happen in your browser during this visit.
 *   declared  — the site says it in its own published policy.
 *   inferred  — Veyl concluded it from what a known service is for.
 *   unknown   — Veyl cannot establish it, and says so rather than guessing.
 *
 * "Unknown" is a first-class answer. A privacy product that resolves
 * uncertainty by picking the scarier option is not telling the truth either.
 */
export type Provenance = 'observed' | 'declared' | 'inferred' | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

/** A single user-facing claim, always traceable back to its evidence. */
export interface Statement {
  text: string;
  provenance: Provenance;
  /** The specific evidence behind the claim, shown under "Why is Veyl telling me this?" */
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Privacy exposure
// ---------------------------------------------------------------------------

export const DIMENSIONS = [
  'tracking',
  'advertising',
  'crossSite',
  'fingerprinting',
  'policyTransparency',
  'userControl',
  'dataRetention',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Deliberately not a number.
 *
 * "none-seen" is not "none": it means Veyl was watching and saw nothing, which
 * is a weaker claim and an honest one. "unknown" means Veyl could not look.
 */
export type ExposureLevel = 'none-seen' | 'low' | 'medium' | 'high' | 'unknown';

export interface ExposureDimension {
  dimension: Dimension;
  level: ExposureLevel;
  provenance: Provenance;
  confidence: Confidence;
  statements: Statement[];
}

export interface RecipientSummary {
  organization: string;
  parent?: string;
  category: Category;
  services: { name: string; domain: Site; category: Category; summary: string; requests: number }[];
  functional: boolean;
}

export interface PrivacyExposure {
  site: Site;
  /** The worst level among the dimensions describing observed behaviour. */
  overall: ExposureLevel;
  /** One sentence. Never stronger than the evidence supports. */
  headline: string;
  /** How much of the picture Veyl actually managed to see. */
  confidence: Confidence;
  confidenceReasons: string[];
  dimensions: ExposureDimension[];
  rightNow: {
    cookies: number;
    thirdPartyCookies: number;
    trackingServices: number;
    companies: number;
    advertisingDetected: boolean;
    sessionReplayDetected: boolean;
    blocked: number;
  };
  /** What the observed services could learn, each with its provenance. */
  mayKnow: { dataType: DataType; label: string; because: string; provenance: Provenance }[];
  recipients: RecipientSummary[];
  /** Questions Veyl explicitly cannot answer from this visit. */
  unknowns: string[];
}

// ---------------------------------------------------------------------------
// What the site says: policy analysis
// ---------------------------------------------------------------------------

export type PolicyTopic =
  | 'collection'
  | 'sharing'
  | 'sale'
  | 'targeted-advertising'
  | 'retention'
  | 'rights'
  | 'consent'
  | 'transfer'
  | 'security';

/** Three-valued on purpose. "Unstated" is a finding, not a missing value. */
export type Stance = 'yes' | 'conditional' | 'no' | 'unstated';

export interface PolicyClaim {
  topic: PolicyTopic;
  /** Plain-language restatement of what the policy asserts. */
  assertion: string;
  /** A short verbatim excerpt so you can check us. */
  quote: string;
  confidence: Confidence;
}

export type PolicyStatus = 'ok' | 'not-found' | 'unreadable' | 'too-large' | 'error';

export interface PolicyAnalysis {
  site: Site;
  url: string | null;
  fetchedAt: number;
  status: PolicyStatus;
  words: number;
  readingMinutes: number;
  claims: PolicyClaim[];
  collects: string[];
  sharesWithThirdParties: Stance;
  sharesForAdvertising: Stance;
  sells: Stance;
  targetedAdvertising: Stance;
  retention: { stance: Stance; detail: string | null };
  rights: string[];
  /** 0–100 internal measure of how clearly the policy is written. */
  clarity: number;
  clarityNotes: string[];
}

export type ConsistencySeverity = 'aligned' | 'note' | 'discrepancy';

export interface ConsistencyFinding {
  severity: ConsistencySeverity;
  topic: PolicyTopic;
  says: string;
  /** True when `says` is the site's own words. A paraphrase is never quoted. */
  saysIsQuote: boolean;
  observed: string;
  explanation: string;
}

// ---------------------------------------------------------------------------
// The report handed to the interface
// ---------------------------------------------------------------------------

export interface ServiceView {
  key: string;
  name: string;
  domain: Site;
  category: Category;
  categoryLabel: string;
  summary: string;
  company: string | null;
  parentCompany: string | null;
  purposes: Purpose[];
  dataTypes: { type: DataType; label: string }[];
  requests: number;
  blocked: number;
  beforeConsent: boolean;
  functional: boolean;
  known: boolean;
  confidence: Confidence | null;
  /** Observed facts about this service on this page. */
  observed: string[];
  /** Questions this observation does not answer. */
  unknowns: string[];
}

export interface CookieView {
  total: number;
  firstParty: number;
  thirdParty: number;
  identifiers: number;
  longestLifetimeDays: number;
  named: {
    name: string;
    domain: string;
    service: string;
    summary: string;
    category: Category;
    lifetimeDays?: number;
    thirdParty: boolean;
  }[];
  unnamed: {
    name: string;
    domain: string;
    thirdParty: boolean;
    lifetimeDays?: number;
    looksLikeIdentifier: boolean;
  }[];
}

export type ReportStatus =
  | 'ok'
  /** Veyl has no permission for this site; the interface offers to ask for it. */
  | 'not-granted'
  /** Permission is granted but the page loaded before Veyl was watching. */
  | 'reload-needed'
  /** Nothing Veyl can analyse (a new tab, a chrome:// page, a local file). */
  | 'unsupported';

export interface SiteReport {
  status: ReportStatus;
  site: Site;
  url: string;
  title?: string;
  startedAt: number;
  exposure: PrivacyExposure;
  services: ServiceView[];
  cookies: CookieView;
  storage: StorageObservation[];
  signals: { kind: ApiSignalKind; label: string; calls: number; attributedTo?: string }[];
  policy: PolicyAnalysis | null;
  policyPending: boolean;
  consistency: ConsistencyFinding[];
  protection: {
    level: 'off' | 'balanced' | 'strict';
    inherited: boolean;
    blocked: number;
    blockedServices: { name: string; count: number }[];
  };
  knowledgeVersion: string;
}

export interface UnavailableReport {
  status: Exclude<ReportStatus, 'ok'>;
  url: string;
  site: Site | null;
  /** The origin pattern to request, when asking would help. */
  originPattern: string | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Local privacy history — aggregate counts, no site identity
// ---------------------------------------------------------------------------

/**
 * Veyl does not remember which websites produced these numbers, because it does
 * not need to. There is no list of sites, no hash of a site, and no timestamped
 * entries — only running totals for the current month.
 */
export interface HistoryTotals {
  month: string;
  pagesAnalyzed: number;
  trackerRequests: number;
  blockedRequests: number;
  /** company label → number of analysed pages it appeared on. */
  companies: Record<string, number>;
  categories: Record<string, number>;
  exposureCounts: Record<ExposureLevel, number>;
  updatedAt: number;
}
