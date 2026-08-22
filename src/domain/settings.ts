import type { Site } from './types';

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
