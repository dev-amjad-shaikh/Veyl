/**
 * The ambient indicator — a colour and a count, nothing else.
 *
 * Its colour is the observed exposure level, and "unknown" is grey rather than
 * green: not looking is not the same as finding nothing.
 *
 * The icon always carries the level. Whether anything is also drawn on the page
 * itself is a separate, quieter decision — see content/notice.ts and the
 * `pageCue` setting — because an icon in a corner is not something anyone
 * notices while reading.
 */
import type { ExposureLevel } from '../domain/types';
import { LEVEL_LABELS } from '../analysis/labels';

const COLOURS: Record<ExposureLevel, string> = {
  'none-seen': '#1a8f4d',
  low: '#4f9439',
  medium: '#bf7d16',
  high: '#bc3336',
  unknown: '#6b7280',
};

/**
 * What the icon says, as a pure decision so it can be tested.
 *
 * Chrome draws no badge at all when the text is empty — which means an empty
 * badge is not a quiet badge, it is an invisible one, and the colour carrying
 * the exposure level never gets shown. A page can be high exposure with nothing
 * to count: no third-party trackers, nothing blocked, and fingerprinting or
 * retention driving the level. Those pages need a mark of their own.
 */
export function badgeFor(
  level: ExposureLevel,
  trackers: number,
  blocked: number
): { text: string; title: string } {
  const counted = blocked > 0 ? String(blocked) : trackers > 0 ? String(trackers) : '';
  const flagged = level === 'high' || level === 'medium';
  const text = counted || (flagged ? '!' : '');

  if (level === 'unknown') return { text: '', title: 'Veyl — not watching this site' };

  const found =
    trackers > 0
      ? `${trackers} tracking service${trackers === 1 ? '' : 's'}${blocked ? `, ${blocked} blocked` : ''}`
      : blocked > 0
        ? `${blocked} request${blocked === 1 ? '' : 's'} blocked`
        : 'nothing followed you off this page';

  // The level leads, because it is the thing a count can fail to explain.
  return { text, title: `Veyl — ${LEVEL_LABELS[level].toLowerCase()} exposure · ${found}` };
}

export async function paint(
  tabId: number,
  level: ExposureLevel,
  trackers: number,
  blocked: number
): Promise<void> {
  const { text, title } = badgeFor(level, trackers, blocked);
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: COLOURS[level] });
    await chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setTitle({ tabId, title });
  } catch {
    // The tab closed while we were painting. Nothing to recover.
  }
}

export async function clear(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: 'Veyl' });
  } catch {
    /* tab gone */
  }
}
