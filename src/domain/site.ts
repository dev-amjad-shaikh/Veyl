import { parse } from 'tldts';
import type { Site } from './types';

export interface HostInfo {
  hostname: string;
  /** Registrable domain (eTLD+1). Falls back to the hostname for IPs and hosts without a public suffix. */
  site: Site;
  isIp: boolean;
}

const cache = new Map<string, HostInfo>();

export function hostInfo(urlOrHost: string): HostInfo | null {
  const cached = cache.get(urlOrHost);
  if (cached) return cached;

  const parsed = parse(urlOrHost, { allowPrivateDomains: false });
  if (!parsed.hostname) return null;

  const info: HostInfo = {
    hostname: parsed.hostname,
    site: parsed.domain ?? parsed.hostname,
    isIp: Boolean(parsed.isIp),
  };
  if (cache.size > 5000) cache.clear();
  cache.set(urlOrHost, info);
  return info;
}

export function siteOf(urlOrHost: string): Site | null {
  return hostInfo(urlOrHost)?.site ?? null;
}

/** "www.shop.example.com" → ["www.shop.example.com", "shop.example.com", "example.com"] */
export function hostSuffixes(hostname: string): string[] {
  const labels = hostname.split('.');
  const out: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) out.push(labels.slice(i).join('.'));
  return out;
}

/** A cookie `domain` attribute ("​.example.com") reduced to its registrable domain. */
export function cookieSite(cookieDomain: string): Site {
  const bare = cookieDomain.replace(/^\./, '');
  return siteOf(bare) ?? bare;
}
