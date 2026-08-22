/**
 * Reads the site's own privacy policy and turns it into checkable claims.
 *
 * This runs entirely in your browser. The policy document is fetched without
 * credentials, parsed here, and the result is cached only in session memory —
 * nothing about which policies you read is written to disk.
 *
 * The extractor is deliberately conservative. Every claim carries the sentence
 * it came from, so the interface can show the user exactly what we read.
 */
import type {
  PolicyAnalysis,
  PolicyClaim,
  PolicyStatus,
  PolicyTopic,
  Site,
  Stance,
} from '../domain/types';

const MAX_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 12_000;

// --- text extraction ------------------------------------------------------

/** Service workers have no DOM parser, so strip markup textually. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Inline tags disappear; block tags become a space. Otherwise "your <b>IP</b>."
    // comes out as "your IP ." and every quoted excerpt looks mangled.
    .replace(/<\/?(?:b|i|u|em|strong|span|a|small|sup|sub|code|mark|abbr|cite|q)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Real policies wrap lines mid-clause, so each sentence is flattened to single
 * spaces before matching. Without this, "the right to request\ndeletion" is
 * invisible to every pattern that expects a space.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20 && s.length < 900);
}

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function excerpt(sentence: string, limit = 220): string {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

// --- claim patterns -------------------------------------------------------

interface Pattern {
  topic: PolicyTopic;
  re: RegExp;
  assertion: string;
  confidence: PolicyClaim['confidence'];
  /** Negations that flip the meaning; checked against the same sentence. */
  negatedBy?: RegExp;
  /**
   * An explicit denial. A section heading like "Sale of personal information"
   * would otherwise be read as an admission two lines above the sentence that
   * denies it, and Veyl would present the site as contradicting itself.
   */
  denial?: boolean;
}

const PATTERNS: Pattern[] = [
  {
    topic: 'sale',
    re: /\b(?:we|us|company)?\s*(?:do not|don['’]t|never|will not)\s+(?:sell|"?sell"?)\b[^.]{0,80}(?:personal (?:information|data)|your (?:information|data))/i,
    assertion: 'States that it does not sell your personal information.',
    confidence: 'high',
    denial: true,
  },
  {
    topic: 'sale',
    re: /\b(?:we|may)\s*(?:may\s+)?(?:sell|have sold)\b[^.]{0,60}(?:personal (?:information|data))|\bsale (?:or sharing )?of (?:your )?personal (?:information|data)\b/i,
    assertion: 'Contemplates selling or sharing personal information as those terms are defined by US privacy law.',
    confidence: 'medium',
    negatedBy: /\b(?:do not|don['’]t|never|will not|no)\s+(?:sell|sale)/i,
  },
  {
    topic: 'targeted-advertising',
    re: /\b(?:targeted|interest[- ]based|personali[sz]ed|behaviou?ral|cross[- ]context behavio(?:u)?ral)\s+(?:advertising|ads|marketing)\b/i,
    assertion: 'Permits advertising targeted to you based on your behaviour.',
    confidence: 'high',
  },
  {
    topic: 'sharing',
    re: /\b(?:share|shares|sharing|disclose|discloses|provide|transfer)\b[^.]{0,80}\b(?:with|to)\b[^.]{0,60}\b(?:advertis\w+|ad networks?|marketing partners?)\b/i,
    assertion: 'Allows your information to be shared with advertising partners.',
    confidence: 'high',
  },
  {
    topic: 'sharing',
    re: /\b(?:share|shares|disclose|discloses|provide)\b[^.]{0,80}\b(?:third[- ]part\w+|service providers?|vendors?|affiliates?|partners?)\b/i,
    assertion: 'Allows your information to be shared with third parties such as vendors, affiliates or partners.',
    confidence: 'high',
  },
  {
    topic: 'collection',
    re: /\b(?:precise|exact) (?:geo)?locations?\b/i,
    assertion: 'Says it may collect your precise location.',
    confidence: 'high',
  },
  {
    topic: 'collection',
    re: /\b(?:collect|collects|obtain|receive)\b[^.]{0,120}\b(?:browsing (?:history|activity|behaviou?r)|pages you (?:visit|view)|clickstream)\b/i,
    assertion: 'Says it collects your browsing activity.',
    confidence: 'high',
  },
  {
    topic: 'collection',
    re: /\b(?:device identifiers?|advertising identifiers?|cookie identifiers?|unique identifiers?|IP address(?:es)?)\b/i,
    assertion: 'Says it collects identifiers such as your IP address or device/advertising IDs.',
    confidence: 'medium',
  },
  {
    topic: 'collection',
    re: /\binferences?\b[^.]{0,80}\b(?:profile|preferences|characteristics|predispositions|behaviou?r)\b/i,
    assertion: 'Says it draws inferences about you to build a profile.',
    confidence: 'high',
  },
  {
    topic: 'retention',
    re: /\bretain\w*\b[^.]{0,120}\b(?:for (?:a period of )?(?:up to )?\d+\s*(?:days?|months?|years?))/i,
    assertion: 'Gives a specific retention period.',
    confidence: 'high',
  },
  {
    topic: 'retention',
    re: /\bretain\w*\b[^.]{0,120}\b(?:as long as (?:is )?necessary|for as long as|until (?:you|it) )/i,
    assertion: 'Says data is kept "as long as necessary" without naming a period.',
    confidence: 'medium',
  },
  {
    topic: 'consent',
    re: /\b(?:strictly |only )?necessary cookies\b[^.]{0,120}\b(?:before|until|unless)\b[^.]{0,60}\bconsent\b/i,
    assertion: 'Says only necessary cookies are used before you consent.',
    confidence: 'high',
  },
  {
    topic: 'consent',
    re: /\byou (?:can|may) withdraw (?:your )?consent\b/i,
    assertion: 'Says you can withdraw consent.',
    confidence: 'high',
  },
  {
    topic: 'transfer',
    re: /\btransfer\w*\b[^.]{0,100}\b(?:outside (?:the )?(?:EEA|European Economic Area|EU|UK)|to the United States|internationally|other countries)\b/i,
    assertion: 'Transfers data to other countries.',
    confidence: 'medium',
  },
  {
    topic: 'security',
    re: /\bno (?:method|system) of (?:transmission|storage)\b[^.]{0,80}\b(?:100%|completely) secure\b/i,
    assertion: 'Notes that it cannot guarantee security.',
    confidence: 'medium',
  },
];

const RIGHTS: { right: string; re: RegExp }[] = [
  { right: 'see your data', re: /\bright to (?:request )?access|\brequest a copy of (?:your|the) (?:personal )?(?:data|information)/i },
  { right: 'delete your data', re: /\bright to (?:request )?(?:deletion|erasure)|\brequest (?:that we )?delete\b/i },
  { right: 'correct your data', re: /\bright to (?:request )?(?:correct\w*|rectif\w*)|\brequest (?:that we )?correct\b/i },
  { right: 'take your data elsewhere', re: /\b(?:data )?portability\b/i },
  { right: 'opt out of targeted ads', re: /\bopt[- ]out of\b[^.]{0,60}\b(?:targeted|interest[- ]based|personali[sz]ed) advertising\b/i },
  { right: 'tell them not to sell or share your data', re: /\bdo not sell (?:or share )?my personal information\b|\bopt[- ]out of the sale\b/i },
  { right: 'object to processing', re: /\bright to object\b/i },
  { right: 'limit use of sensitive data', re: /\blimit the use (?:and disclosure )?of (?:my )?sensitive personal information\b/i },
];

const COLLECTION_CATEGORIES: { label: string; re: RegExp }[] = [
  { label: 'Who you are (name, email, account)', re: /\b(?:your )?(?:name|e-?mail address|postal address|phone number|account (?:name|details))\b/i },
  { label: 'Where you are', re: /\b(?:geo)?location (?:data|information)\b|\bIP address\b/i },
  { label: 'Your device and browser', re: /\b(?:device|browser) (?:type|information|identifiers?)\b|\boperating system\b/i },
  { label: 'What you browse', re: /\bbrowsing (?:history|activity)\b|\bpages you (?:visit|view)\b|\bclickstream\b/i },
  { label: 'What you buy', re: /\b(?:purchase|transaction|order) (?:history|information|records)\b/i },
  { label: 'Advertising identifiers', re: /\badvertising (?:id|identifier)s?\b|\bcookie identifiers?\b/i },
  { label: 'Inferences about you', re: /\binferences?\b/i },
  { label: 'Content you provide', re: /\bcontent you (?:upload|submit|post|provide)\b/i },
];

const HEDGES = /\b(?:may|might|could|generally|typically|from time to time|such as|including,? but not limited to|as (?:we deem )?necessary|where (?:appropriate|permitted)|among other things)\b/gi;

// --- analysis -------------------------------------------------------------

function stanceFrom(claims: PolicyClaim[], topic: PolicyTopic, positive: RegExp, negative: RegExp): Stance {
  const relevant = claims.filter((c) => c.topic === topic);
  if (relevant.some((c) => negative.test(c.assertion))) return 'no';
  const hit = relevant.find((c) => positive.test(c.assertion));
  if (!hit) return 'unstated';
  return /\bmay\b|contemplat|permits|allows/i.test(hit.assertion) ? 'conditional' : 'yes';
}

export function analyzeText(text: string, site: Site, url: string | null): PolicyAnalysis {
  const parts = sentences(text);
  const words = text.split(/\s+/).length;
  const claims: PolicyClaim[] = [];
  const seen = new Set<string>();
  const denied = new Set<PolicyTopic>();

  for (const sentence of parts) {
    for (const pattern of PATTERNS) {
      if (!pattern.re.test(sentence)) continue;
      if (pattern.negatedBy?.test(sentence)) continue;
      const key = `${pattern.topic}|${pattern.assertion}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (pattern.denial) denied.add(pattern.topic);
      claims.push({
        topic: pattern.topic,
        assertion: pattern.assertion,
        quote: excerpt(sentence),
        confidence: pattern.confidence,
      });
    }
  }

  // An explicit denial outranks a merely contextual mention of the same topic.
  const settled = claims.filter(
    (claim) => !(denied.has(claim.topic) && claim.confidence !== 'high')
  );
  claims.length = 0;
  claims.push(...settled);

  const flat = flatten(text);
  const rights = RIGHTS.filter(({ re }) => re.test(flat)).map(({ right }) => right);
  const collects = COLLECTION_CATEGORIES.filter(({ re }) => re.test(flat)).map(({ label }) => label);

  const hedgeCount = (text.match(HEDGES) ?? []).length;
  const hedgeRate = words > 0 ? (hedgeCount / words) * 1000 : 0;
  const avgSentence = parts.length > 0 ? words / parts.length : 0;

  const clarityNotes: string[] = [];
  let clarity = 100;
  if (words > 8000) {
    clarity -= 30;
    clarityNotes.push(`It runs to about ${Math.round(words / 100) * 100} words — roughly ${Math.ceil(words / 220)} minutes of reading.`);
  } else if (words > 4000) {
    clarity -= 15;
    clarityNotes.push(`About ${Math.ceil(words / 220)} minutes of reading.`);
  } else if (words > 0) {
    clarityNotes.push(`A short policy — about ${Math.max(1, Math.ceil(words / 220))} minutes of reading.`);
  }
  if (hedgeRate > 12) {
    clarity -= 25;
    clarityNotes.push('Heavy use of hedging language like "may", "such as" and "including but not limited to".');
  } else if (hedgeRate > 6) {
    clarity -= 12;
    clarityNotes.push('Some hedging language that leaves the commitments open-ended.');
  }
  if (avgSentence > 32) {
    clarity -= 12;
    clarityNotes.push('Long sentences make the obligations hard to follow.');
  }
  if (rights.length >= 3) {
    clarity += 10;
    clarityNotes.push('Your rights are spelled out.');
  } else if (rights.length === 0) {
    clarity -= 15;
    clarityNotes.push('No clear statement of your rights.');
  }
  if (claims.some((c) => c.topic === 'retention' && c.confidence === 'high')) {
    clarity += 8;
    clarityNotes.push('It commits to a specific retention period.');
  }
  clarity = Math.max(0, Math.min(100, clarity));

  const retentionSpecific = claims.find((c) => c.topic === 'retention' && c.confidence === 'high');
  const retentionVague = claims.find((c) => c.topic === 'retention');

  return {
    site,
    url,
    fetchedAt: Date.now(),
    status: 'ok',
    words,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
    claims,
    collects,
    sharesWithThirdParties: stanceFrom(claims, 'sharing', /third parties|vendors|affiliates|partners/i, /never/i),
    sharesForAdvertising: stanceFrom(claims, 'sharing', /advertising partners/i, /never/i),
    sells: stanceFrom(claims, 'sale', /Contemplates selling/i, /does not sell/i),
    targetedAdvertising: stanceFrom(claims, 'targeted-advertising', /Permits advertising/i, /never/i),
    retention: {
      stance: retentionSpecific ? 'yes' : retentionVague ? 'conditional' : 'unstated',
      detail: retentionSpecific?.quote ?? retentionVague?.quote ?? null,
    },
    rights,
    clarity,
    clarityNotes,
  };
}

export function emptyAnalysis(site: Site, url: string | null, status: PolicyStatus): PolicyAnalysis {
  return {
    site,
    url,
    fetchedAt: Date.now(),
    status,
    words: 0,
    readingMinutes: 0,
    claims: [],
    collects: [],
    sharesWithThirdParties: 'unstated',
    sharesForAdvertising: 'unstated',
    sells: 'unstated',
    targetedAdvertising: 'unstated',
    retention: { stance: 'unstated', detail: null },
    rights: [],
    clarity: 0,
    clarityNotes: [],
  };
}

export async function fetchPolicy(site: Site, candidates: string[]): Promise<PolicyAnalysis> {
  for (const url of candidates.slice(0, 4)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const size = Number(response.headers.get('content-length') ?? '0');
      if (size > MAX_BYTES) return emptyAnalysis(site, url, 'too-large');
      const html = await response.text();
      if (html.length > MAX_BYTES) return emptyAnalysis(site, url, 'too-large');
      const text = htmlToText(html);
      if (text.split(/\s+/).length < 150) continue;
      return analyzeText(text, site, url);
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return emptyAnalysis(site, candidates[0] ?? null, candidates.length ? 'unreadable' : 'not-found');
}

/** Conventional locations to try when the page links to no policy. */
export function guessPolicyUrls(pageUrl: string): string[] {
  try {
    const origin = new URL(pageUrl).origin;
    return [
      `${origin}/privacy`,
      `${origin}/privacy-policy`,
      `${origin}/legal/privacy`,
      `${origin}/en/privacy`,
    ];
  } catch {
    return [];
  }
}
