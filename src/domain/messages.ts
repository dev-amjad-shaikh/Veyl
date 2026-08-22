/** The extension's internal protocol. One file so every surface agrees. */
import type {
  ApiSignalKind,
  HistoryTotals,
  PolicyLink,
  Site,
  SiteReport,
  StorageObservation,
  UnavailableReport,
} from './types';
import type { ProtectionLevel, Settings } from './settings';

export interface PageReportPayload {
  title?: string;
  storage?: StorageObservation[];
  signals?: { kind: ApiSignalKind; calls: number; attributedTo?: string }[];
  policyLinks?: PolicyLink[];
  consentBannerSeen?: boolean;
  consentDecided?: boolean;
}

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
  | { type: 'access-changed' };

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
}

export function send<T extends Message['type']>(
  message: Extract<Message, { type: T }>
): Promise<Responses[T]> {
  return chrome.runtime.sendMessage(message) as Promise<Responses[T]>;
}
