/**
 * Privacy history — aggregate counts only.
 *
 * There is no list of sites here. No URL, no domain, no hash of a domain, no
 * timestamps, no per-visit rows. Veyl keeps running totals for the current
 * month and nothing that could reconstruct where you have been.
 *
 * It is off until you turn it on, it never leaves this device, and clearing it
 * removes the record entirely.
 */
import type { HistoryTotals, SiteReport } from '../domain/types';

const HISTORY_KEY = 'history';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function empty(month: string): HistoryTotals {
  return {
    month,
    pagesAnalyzed: 0,
    trackerRequests: 0,
    blockedRequests: 0,
    companies: {},
    categories: {},
    exposureCounts: { 'none-seen': 0, low: 0, medium: 0, high: 0, unknown: 0 },
    updatedAt: Date.now(),
  };
}

async function read(): Promise<HistoryTotals> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const record = stored[HISTORY_KEY] as HistoryTotals | undefined;
  const month = currentMonth();
  if (!record || record.month !== month) return empty(month);
  return record;
}

/** Records one finished page visit as counters. Called at most once per visit. */
export async function recordVisit(report: SiteReport): Promise<void> {
  const totals = await read();

  totals.pagesAnalyzed += 1;
  totals.trackerRequests += report.services
    .filter((service) => !service.functional)
    .reduce((sum, service) => sum + service.requests, 0);
  totals.blockedRequests += report.protection.blocked;
  totals.exposureCounts[report.exposure.overall] += 1;

  for (const service of report.services) {
    if (service.functional || !service.known) continue;
    totals.categories[service.category] = (totals.categories[service.category] ?? 0) + 1;
  }

  // One increment per page, so the number reads as "appeared on N of your pages".
  for (const recipient of report.exposure.recipients) {
    totals.companies[recipient.organization] = (totals.companies[recipient.organization] ?? 0) + 1;
  }

  totals.updatedAt = Date.now();
  await chrome.storage.local.set({ [HISTORY_KEY]: totals });
}

export async function readTotals(): Promise<HistoryTotals> {
  return read();
}

export async function clearHistory(): Promise<HistoryTotals> {
  await chrome.storage.local.remove(HISTORY_KEY);
  return empty(currentMonth());
}

