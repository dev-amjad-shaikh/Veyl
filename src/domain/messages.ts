/** The extension's internal protocol. One file so every surface agrees. */
import type {
  ApiSignalKind,
  ExposureLevel,
  HarvestField,
  HistoryTotals,
  PolicyLink,
  Site,
  SiteReport,
  StorageObservation,
  UnavailableReport,
} from './types';
import type { PageCue, ProtectionLevel, Settings } from './settings';

export interface PageReportPayload {
  title?: string;
  storage?: StorageObservation[];
  signals?: { kind: ApiSignalKind; calls: number; attributedTo?: string }[];
  harvestConfigs?: { entryId: string; accountId: string; fields: HarvestField[] }[];
  policyLinks?: PolicyLink[];
  consentBannerSeen?: boolean;
  consentDecided?: boolean;
}

/**
 * What the service worker tells a page's collector to draw.
 *
 * Only names and field labels cross this boundary — never a value, never a URL.
 * The collector is in the page's process, so the less it is handed the better.
 */
export interface PageCuePayload {
  level: ExposureLevel;
  cue: PageCue;
  formNotice: boolean;
  /** One sentence on what this level means here, from the exposure engine. */
  headline: string;
  /** The dimensions that drove it — the answer to "high because of what?". */
  drivers: string[];
  /** Enough to make the claim checkable at a glance. */
  counts: { trackers: number; companies: number; cookies: number; blocked: number };
  /** Trackers here that declare which fields they will take from a form. */
  declared: { name: string; fields: string[] }[];
  /** Personal data seen leaving, and whether Veyl stopped it. */
  sent: { name: string; fields: string[]; blocked: boolean }[];
}

/** Messages addressed to a tab rather than to the service worker. */
export type TabMessage = { type: 'page-cue'; payload: PageCuePayload };

export type Message =
  | { type: 'page-start'; url: string }
  | { type: 'page-report'; payload: PageReportPayload }
  | { type: 'get-report'; tabId?: number }
  | { type: 'get-settings' }
  | { type: 'update-settings'; patch: Partial<Settings> }
  | { type: 'set-site-protection'; site: Site; level: ProtectionLevel | 'inherit' }
  | { type: 'read-policy'; tabId: number }
  | { type: 'get-history' }
  | { type: 'clear-history' }
  | { type: 'access-changed' }
  | { type: 'get-knowledge' }
  | { type: 'mute-site' }
  | { type: 'open-panel' };

export interface Responses {
  'page-start': { ok: true };
  'page-report': { ok: true };
  'get-report': SiteReport | UnavailableReport;
  'get-settings': Settings;
  'update-settings': Settings;
  'set-site-protection': Settings;
  'read-policy': SiteReport | UnavailableReport;
  'get-history': HistoryTotals;
  'clear-history': HistoryTotals;
  'access-changed': { ok: true };
  'get-knowledge': { version: string; services: number };
  'mute-site': { ok: true };
  'open-panel': { ok: true };
}

export function send<T extends Message['type']>(
  message: Extract<Message, { type: T }>
): Promise<Responses[T]> {
  return chrome.runtime.sendMessage(message) as Promise<Responses[T]>;
}
