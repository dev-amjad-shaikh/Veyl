/**
 * These tests guard the promises Veyl makes to a person, not its implementation.
 * If one of them fails, the product is lying to someone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNCTIONAL_CATEGORIES,
  blockableDomains,
  neverBlockedDomains,
  buildRules,
  identifyRequest,
  identifyCookie,
  isFunctional,
  allTrackers,
  DEFAULT_SETTINGS,
  looksLikeIdentifier,
  siteOf,
} from './.build/harness.mjs';

test('nothing a page needs to work is ever blockable', () => {
  for (const { domain, entryId, category } of blockableDomains()) {
    assert.ok(
      !FUNCTIONAL_CATEGORIES.includes(category),
      `${entryId} (${domain}) is category "${category}", which a page may need to function`
    );
  }
});

test('every payment, sign-in, bot-protection and consent service is excluded from blocking', () => {
  const blockable = new Set(blockableDomains().map((d) => d.domain));
  for (const entry of allTrackers) {
    if (!isFunctional(entry.category)) continue;
    for (const domain of entry.domains) {
      assert.ok(!blockable.has(domain), `${entry.name} (${domain}) must never be blocked`);
    }
  }
});

/**
 * A page's own requests must never be blocked. Without this, visiting a company
 * that also runs a tracker — facebook.com, reddit.com, x.com — blocked that
 * site's own scripts and left a blank page. Checking the category alone missed
 * it, because the category was right and the domain was the problem.
 */
test('a site is never blocked from loading its own resources', () => {
  for (const level of ['balanced', 'strict']) {
    const rules = buildRules({ ...DEFAULT_SETTINGS, protection: level });
    for (const rule of rules.filter((r) => r.action.type === 'block')) {
      assert.equal(
        rule.condition.domainType,
        'thirdParty',
        `at "${level}", a block rule could match a page's own requests`
      );
    }
  }
});

test('a tracker company’s own website and CDN are never blocked', () => {
  const blockable = new Set(blockableDomains().map((d) => d.domain));
  const destinations = [
    'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 't.co', 'tiktok.com',
    'reddit.com', 'pinterest.com', 'linkedin.com', 'youtube.com', 'snapchat.com',
    'spotify.com', 'vimeo.com', 'yahoo.com', 'adobe.com', 'yandex.ru', 'bing.com',
    'twimg.com', 'fbcdn.net', 'ytimg.com', 'licdn.com', 'pinimg.com', 'scdn.co',
    'cdninstagram.com', 'redditstatic.com', 'vimeocdn.com', 'tiktokcdn.com', 'yimg.com',
  ];
  for (const domain of destinations) {
    assert.ok(!blockable.has(domain), `${domain} is somewhere a person goes on purpose; blocking it breaks that page`);
  }
});

test('nothing marked unsafe to block is blockable', () => {
  const blockable = new Set(blockableDomains().map((d) => d.domain));
  for (const domain of neverBlockedDomains()) {
    assert.ok(!blockable.has(domain), `${domain} is marked neverBlock but is still in the block list`);
  }
});

test('excluding those domains did not quietly disable tracker blocking', () => {
  const blockable = new Set(blockableDomains().map((d) => d.domain));
  // The precise endpoints, kept while the company's website is spared.
  for (const endpoint of [
    'connect.facebook.net', 'analytics.tiktok.com', 'ct.pinterest.com',
    'px.ads.linkedin.com', 'ads-twitter.com', 'mc.yandex.ru',
    'doubleclick.net', 'criteo.net', 'adnxs.com', 'hotjar.com', 'clarity.ms',
  ]) {
    assert.ok(blockable.has(endpoint), `${endpoint} should still be blocked`);
  }
  assert.ok(blockable.size > 120, `expected a substantial block list, got ${blockable.size}`);
});

test('protection off means no blocking rules at all', () => {
  const rules = buildRules({ ...DEFAULT_SETTINGS, protection: 'off', globalPrivacyControl: false });
  assert.equal(rules.filter((r) => r.action.type === 'block').length, 0);
});

test('turning a site off excludes it from every blocking rule', () => {
  const rules = buildRules({
    ...DEFAULT_SETTINGS,
    protection: 'strict',
    perSite: { 'example.com': 'off' },
  });
  for (const rule of rules.filter((r) => r.action.type === 'block')) {
    assert.ok(
      rule.condition.excludedInitiatorDomains?.includes('example.com'),
      'a site set to off must be excluded from blocking'
    );
  }
});

test('a single site can be protected while the global default is off', () => {
  const rules = buildRules({
    ...DEFAULT_SETTINGS,
    protection: 'off',
    perSite: { 'shop.example': 'balanced' },
  });
  const blocking = rules.filter((r) => r.action.type === 'block');
  assert.ok(blocking.length > 0, 'the one protected site should still be protected');
  for (const rule of blocking) {
    assert.deepEqual(
      rule.condition.initiatorDomains,
      ['shop.example'],
      'a site left at the default must not be affected by another site’s choice'
    );
  }
});

test('shared domains are told apart by request path, not guessed', () => {
  assert.equal(identifyRequest('https://www.google.com/recaptcha/api.js', 'www.google.com')?.category, 'fraud-prevention');
  assert.equal(identifyRequest('https://www.google.com/pagead/1p-conversion/', 'www.google.com')?.category, 'advertising');
  assert.equal(identifyRequest('https://www.googletagmanager.com/gtm.js?id=X', 'www.googletagmanager.com')?.category, 'tag-manager');
  assert.equal(identifyRequest('https://stats.g.doubleclick.net/x', 'stats.g.doubleclick.net')?.category, 'advertising');
});

test('an unrecognised domain resolves to nothing rather than a guess', () => {
  assert.equal(identifyRequest('https://widgets.some-startup.io/a.js', 'widgets.some-startup.io'), null);
});

test('cookie names are matched exactly or by declared prefix, never fuzzily', () => {
  assert.equal(identifyCookie('_ga')?.service, 'Google Analytics');
  assert.equal(identifyCookie('_ga_X7H2K')?.service, 'Google Analytics 4');
  assert.equal(identifyCookie('_gcl_au')?.service, 'Google Ads');
  assert.equal(identifyCookie('totally_unknown_cookie'), null);
});

test('identifier detection rejects settings and accepts real identifiers', () => {
  assert.equal(looksLikeIdentifier('en-GB'), false);
  assert.equal(looksLikeIdentifier('true'), false);
  assert.equal(looksLikeIdentifier('1'), false);
  assert.equal(looksLikeIdentifier('1724284800'), false);
  assert.equal(looksLikeIdentifier('9f8c1e2b4a7d6053f1c8b9a2e4d70615'), true);
  assert.equal(looksLikeIdentifier('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), true);
});

test('registrable domains are resolved with the real public suffix list', () => {
  assert.equal(siteOf('https://www.bbc.co.uk/news'), 'bbc.co.uk');
  assert.equal(siteOf('https://a.b.example.com/x'), 'example.com');
  assert.equal(siteOf('https://cdn.example.com/x'), 'example.com');
  assert.equal(siteOf('https://ads.doubleclick.net/x'), 'doubleclick.net');
});
