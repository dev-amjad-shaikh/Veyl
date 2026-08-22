/**
 * The ambient indicator — a colour and a count, nothing else.
 *
 * The icon is the only thing Veyl puts in front of you unless you ask for more.
 * Its colour is the observed exposure level, and "unknown" is grey rather than
 * green: not looking is not the same as finding nothing.
 */
import type { ExposureLevel } from '../domain/types';

const COLOURS: Record<ExposureLevel, string> = {
  'none-seen': '#1a8f4d',
  low: '#4f9439',
  medium: '#bf7d16',
  high: '#bc3336',
  unknown: '#6b7280',
};

export async function paint(
  tabId: number,
  level: ExposureLevel,
  trackers: number,
  blocked: number
): Promise<void> {
  const text = blocked > 0 ? String(blocked) : trackers > 0 ? String(trackers) : '';
  const title =
    level === 'unknown'
      ? 'Veyl — not watching this site'
      : trackers === 0
        ? 'Veyl — nothing here followed you'
        : `Veyl — ${trackers} tracking service${trackers === 1 ? '' : 's'}${blocked ? `, ${blocked} blocked` : ''}`;
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
