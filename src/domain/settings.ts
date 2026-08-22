import type { Site } from './types';

/** The host patterns Veyl asks for when a person turns it on for every site. */
export const ALL_SITE_PATTERNS = ['http://*/*', 'https://*/*'];

/**
 * Protection levels.
 *  off       — observe only, block nothing.
 *  balanced  — block advertising, behavioural profiling and session replay.
 *              Analytics, CDNs, payment, login and bot protection are left alone.
 *  strict    — also block analytics and tag managers.
 * Nothing a page needs to log you in, take payment or pass a bot check is ever
 * blocked at any level; that promise is enforced in knowledge/graph.ts.
 */
export type ProtectionLevel = 'off' | 'balanced' | 'strict';

export interface Settings {
  onboardedAt: number | null;
  protection: ProtectionLevel;
  /** Per-site overrides. Absent means "use the global level". */
  perSite: Record<Site, ProtectionLevel>;
  /**
   * Keep a local, aggregate tally of what was observed. Off until you ask for
   * it, counters only, never leaves this device. See background/history.ts.
   */
  historyEnabled: boolean;
  /** Read and interpret the site's published privacy policy. Fetched by your browser only. */
  policyAnalysis: boolean;
  /** Send Global Privacy Control on requests. */
  globalPrivacyControl: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  onboardedAt: null,
  protection: 'balanced',
  perSite: {},
  historyEnabled: false,
  policyAnalysis: true,
  globalPrivacyControl: true,
};

export function effectiveProtection(settings: Settings, site: Site): ProtectionLevel {
  return settings.perSite[site] ?? settings.protection;
}

/**
 * What each level actually does, in the words the interface uses.
 *
 * Kept beside the setting rather than beside the blocking code, so the popup and
 * the settings page never have to reach into the service worker to describe it.
 */
export const PROTECTION_DESCRIPTIONS: Record<ProtectionLevel, { title: string; does: string[]; keeps: string[] }> = {
  off: {
    title: 'Watching only',
    does: ['Veyl explains what happens but changes nothing.'],
    keeps: ['Every part of the site behaves exactly as the site intended.'],
  },
  balanced: {
    title: 'Protected',
    does: [
      'Blocks advertising and ad-measurement services',
      'Blocks session recording',
      'Strips campaign tracking codes from links you open',
      'Sends Global Privacy Control',
    ],
    keeps: [
      'Sign-in, checkout, payments and bot protection are never blocked',
      'The site’s own analytics and its cookie banner keep working',
    ],
  },
  strict: {
    title: 'Strict',
    does: [
      'Everything in Protected',
      'Also blocks analytics, tag managers, social embeds and marketing tools',
    ],
    keeps: [
      'Sign-in, checkout, payments and bot protection are never blocked',
      'Some embedded videos and chat widgets will not load',
    ],
  },
};
