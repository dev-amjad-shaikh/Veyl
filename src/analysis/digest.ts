/**
 * The evidence digest: the only thing the on-device model is ever shown.
 *
 * Veyl's rule is that the evidence engine determines facts and the explanation
 * layer only phrases them. A language model is an explanation layer, so it is
 * given a projection of the report and nothing else — no page content, no URL
 * beyond the site name, no cookie values, and no access to the browser.
 *
 * Every line is already a conclusion the deterministic engine reached and can
 * defend, tagged with how it was reached. If a fact is not in here, the model
 * has no way to assert it, and is told to say so.
 */
import type { SiteReport } from '../domain/types';
import { CATEGORY_LABELS, DIMENSION_LABELS, LEVEL_LABELS } from './labels';

const MAX_SERVICES = 12;
const MAX_COOKIES = 10;
const MAX_CLAIMS = 6;

export function buildDigest(report: SiteReport): string {
  const { exposure, policy } = report;
  const lines: string[] = [];
  const section = (title: string) => lines.push('', title.toUpperCase());

  lines.push(`SITE: ${report.site}`);
  lines.push(`OVERALL EXPOSURE: ${LEVEL_LABELS[exposure.overall]} (Veyl's confidence: ${exposure.confidence})`);

  section('Levels');
  for (const dimension of exposure.dimensions) {
    lines.push(`- ${DIMENSION_LABELS[dimension.dimension]}: ${LEVEL_LABELS[dimension.level]}`);
  }

  section('Counts');
  lines.push(
    `- ${exposure.rightNow.trackingServices} tracking services, ${exposure.rightNow.companies} companies contacted`,
    `- ${exposure.rightNow.cookies} cookies (${exposure.rightNow.thirdPartyCookies} third-party)`,
    `- ${exposure.rightNow.blocked} requests blocked by Veyl (protection: ${report.protection.level})`
  );

  const tracking = report.services.filter((s) => !s.functional).slice(0, MAX_SERVICES);
  if (tracking.length > 0) {
    section('Tracking services observed');
    for (const service of tracking) {
      const owner = service.parentCompany ?? service.company;
      const learns = service.dataTypes.map((d) => d.label.toLowerCase()).join('; ');
      lines.push(
        `- ${service.name}${owner ? ` (${owner})` : ''} — ${CATEGORY_LABELS[service.category].toLowerCase()}. ${service.summary}${
          learns ? ` Can learn: ${learns}.` : ''
        }${service.beforeConsent ? ' Loaded before any cookie choice was made.' : ''}`
      );
    }
  }

  const functional = report.services.filter((s) => s.functional);
  if (functional.length > 0) {
    section('Services this page needs to work (never blocked)');
    lines.push(`- ${functional.map((s) => s.name).join(', ')}`);
  }

  if (report.cookies.named.length > 0) {
    section('Cookies Veyl can name');
    for (const cookie of report.cookies.named.slice(0, MAX_COOKIES)) {
      const life = cookie.lifetimeDays === undefined ? 'expires with the session' : `expires in ${cookie.lifetimeDays} days`;
      lines.push(`- ${cookie.name} (${cookie.service}) — ${cookie.summary} It ${life}.`);
    }
  }
  if (report.cookies.unnamed.length > 0) {
    lines.push(`- ${report.cookies.unnamed.length} further cookies Veyl cannot identify.`);
  }

  if (report.signals.length > 0) {
    section('Fingerprinting signals observed');
    for (const signal of report.signals) {
      lines.push(`- ${signal.label}${signal.attributedTo ? ` (by ${signal.attributedTo})` : ''}.`);
    }
  }

  section('What they may know');
  for (const item of exposure.mayKnow) {
    lines.push(`- [${item.provenance}] ${item.label} — ${item.because}.`);
  }

  if (policy?.status === 'ok') {
    section('What the published policy says (declared, not observed)');
    lines.push(
      `- Sells personal data: ${policy.sells}`,
      `- Shares with advertising partners: ${policy.sharesForAdvertising}`,
      `- Targeted advertising: ${policy.targetedAdvertising}`,
      `- States a retention period: ${policy.retention.stance}`,
      `- Rights offered: ${policy.rights.length > 0 ? policy.rights.join(', ') : 'none found'}`,
      `- Length: about ${policy.readingMinutes} minutes of reading`
    );
    for (const claim of policy.claims.slice(0, MAX_CLAIMS)) {
      lines.push(`- ${claim.assertion} Quote: "${claim.quote}"`);
    }
  } else {
    section('What the published policy says');
    lines.push('- Veyl has not been able to read a privacy policy for this site.');
  }

  if (report.consistency.length > 0) {
    section('Policy compared with observed behaviour');
    for (const finding of report.consistency) {
      lines.push(`- [${finding.severity}] Says: ${finding.says} Observed: ${finding.observed}`);
    }
  }

  section('What Veyl cannot establish');
  for (const unknown of exposure.unknowns) lines.push(`- ${unknown}`);

  return lines.join('\n').trim();
}

/**
 * The model's instructions. Deliberately narrow: it is a translator for the
 * evidence above, not an authority on privacy.
 */
export const EXPLAINER_INSTRUCTIONS = `You are the explainer inside Veyl, a browser extension that watches what a website does with a person's data.

You will be given EVIDENCE that Veyl gathered for one page. Answer the person's question about that page using ONLY that evidence.

Rules you must not break:
- If the evidence does not answer the question, say plainly that Veyl cannot tell from this visit. Never fill a gap with a guess.
- Never invent a company, a number, a cookie or a service that is not in the evidence.
- Evidence lines are marked observed, declared, inferred or unknown. "Observed" means Veyl watched it happen. "Declared" means the site claims it in writing. "Inferred" means Veyl concluded it from what a service is known to do. Keep that difference when it matters.
- Never say a site sold someone's data. Sharing data with advertisers is not proof of a sale, and Veyl cannot see the contracts.
- "None seen" means Veyl watched and saw nothing. It is not proof that nothing happened. Do not upgrade it to "none".
- Do not give legal advice and do not tell the person whether a site is trustworthy overall.

How to write:
- Plain English, the way you would explain it to a friend who has never heard of a tracking pixel.
- Two to four sentences unless the person asks for more.
- No markdown, no bullet points, no headings.
- Be calm. Do not frighten the person, and do not reassure them past what the evidence supports.`;
