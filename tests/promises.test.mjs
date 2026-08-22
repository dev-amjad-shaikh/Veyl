/**
 * These tests guard the promises Veyl makes to a person, not its implementation.
 * If one of them fails, the product is lying to someone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNCTIONAL_CATEGORIES,
  blockableDomains,
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
  assert.equal(blocking.length, 1);
  assert.deepEqual(blocking[0].condition.initiatorDomains, ['shop.example']);
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
