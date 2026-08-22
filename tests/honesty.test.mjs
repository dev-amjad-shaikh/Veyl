/**
 * Veyl's central claim is that it does not overstate what it knows.
 * These tests hold it to that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeText,
  assessExposure,
  buildInventory,
  buildReport,
  compare,
  htmlToText,
} from './.build/harness.mjs';

function visit(overrides = {}) {
  return {
    visitId: 'v1',
    tabId: 1,
    site: 'shop.example',
    url: 'https://shop.example/product/42',
    startedAt: 0,
    updatedAt: 0,
    consent: { bannerSeen: false, decidedAt: null },
    domains: {},
    cookies: [],
    storage: [],
    signals: [],
    policyLinks: [],
    ...overrides,
  };
}

function domain(name, serviceIds, extra = {}) {
  return {
    domain: name,
    firstSeenAt: 0,
    requests: 3,
    kinds: ['script'],
    hosts: [name],
    serviceIds,
    setCookie: false,
    beforeConsent: true,
    blocked: 0,
    ...extra,
  };
}

const TRACKED = visit({
  domains: {
    'doubleclick.net': domain('doubleclick.net', ['google-ad-manager']),
    'facebook.net': domain('facebook.net', ['meta-pixel']),
    'hotjar.com': domain('hotjar.com', ['hotjar']),
    'stripe.com': domain('stripe.com', ['stripe']),
    'widgets.unknown-vendor.io': domain('unknown-vendor.io', []),
  },
  cookies: [
    { name: '_fbp', domain: 'shop.example', thirdParty: false, session: false, lifetimeDays: 90, httpOnly: false, sameSite: 'lax', looksLikeIdentifier: true },
    { name: 'IDE', domain: 'doubleclick.net', thirdParty: true, session: false, lifetimeDays: 730, httpOnly: true, sameSite: 'no_restriction', looksLikeIdentifier: true },
  ],
});

test('with nothing observed, every level is unknown — never "none"', () => {
  const inventory = buildInventory(visit());
  const exposure = assessExposure('shop.example', inventory, null, false);
  for (const dimension of exposure.dimensions) {
    assert.equal(dimension.level, 'unknown', `${dimension.dimension} should be unknown before Veyl looks`);
  }
  assert.equal(exposure.overall, 'unknown');
  assert.equal(exposure.confidence, 'low');
});

test('a clean page reports "none seen", not "none"', () => {
  const clean = visit({ domains: { 'fastly.net': domain('fastly.net', ['fastly']) } });
  const exposure = assessExposure('shop.example', buildInventory(clean), null, true);
  assert.equal(exposure.dimensions.find((d) => d.dimension === 'tracking').level, 'none-seen');
  assert.equal(exposure.dimensions.find((d) => d.dimension === 'advertising').level, 'none-seen');
  assert.equal(exposure.overall, 'none-seen');
});

test('absence of fingerprinting is reported at medium confidence, never high', () => {
  const exposure = assessExposure('shop.example', buildInventory(TRACKED), null, true);
  const fingerprinting = exposure.dimensions.find((d) => d.dimension === 'fingerprinting');
  assert.equal(fingerprinting.level, 'none-seen');
  assert.equal(fingerprinting.confidence, 'medium');
  assert.ok(fingerprinting.statements.some((s) => s.provenance === 'unknown'));
});

test('every statement carries a provenance and heavy tracking reads as high', () => {
  const exposure = assessExposure('shop.example', buildInventory(TRACKED), null, true);
  assert.equal(exposure.overall, 'high');
  for (const dimension of exposure.dimensions) {
    for (const statement of dimension.statements) {
      assert.ok(['observed', 'declared', 'inferred', 'unknown'].includes(statement.provenance));
      assert.ok(statement.text.length > 0);
    }
  }
});

test('unidentified domains lower confidence rather than being assumed harmless', () => {
  const mostlyUnknown = visit({
    domains: {
      'a.io': domain('a.io', []),
      'b.io': domain('b.io', []),
      'c.io': domain('c.io', []),
      'doubleclick.net': domain('doubleclick.net', ['google-ad-manager']),
    },
  });
  const exposure = assessExposure('shop.example', buildInventory(mostlyUnknown), null, true);
  assert.equal(exposure.confidence, 'medium');
  assert.ok(exposure.confidenceReasons.some((r) => r.includes('not in Veyl')));
});

test('payment and bot-protection services are never counted as tracking', () => {
  const inventory = buildInventory(TRACKED);
  assert.ok(inventory.tracking.every((s) => s.name !== 'Stripe'));
  assert.ok(inventory.functional.some((s) => s.name === 'Stripe'));
});

test('"unknown" is always offered as a first-class answer', () => {
  const exposure = assessExposure('shop.example', buildInventory(TRACKED), null, true);
  assert.ok(exposure.unknowns.length > 0);
  assert.ok(exposure.unknowns.some((u) => u.toLowerCase().includes('sold')));
});

test('a policy that denies selling is read as denying it', () => {
  const policy = analyzeText(
    'We do not sell your personal information to third parties. We may share your information with advertising partners to show you relevant offers. You have the right to request deletion of your data and the right to request access to it.',
    'shop.example',
    'https://shop.example/privacy'
  );
  assert.equal(policy.sells, 'no');
  assert.notEqual(policy.sharesForAdvertising, 'unstated');
  assert.ok(policy.rights.includes('delete your data'));
  assert.ok(policy.claims.every((c) => c.quote.length > 0));
});

test('advertising trackers alongside a no-sale promise is a note, not an accusation', () => {
  const policy = analyzeText(
    'We do not sell your personal information. We use cookies to operate the site.',
    'shop.example',
    'https://shop.example/privacy'
  );
  const withBrokers = visit({
    domains: { 'rlcdn.com': domain('rlcdn.com', ['liveramp']) },
  });
  const findings = compare(buildInventory(withBrokers), policy);
  const saleFinding = findings.find((f) => f.topic === 'sale');
  assert.equal(saleFinding.severity, 'note');
  assert.ok(saleFinding.explanation.includes('not evidence of a sale'));
});

test('tracking before consent contradicts a necessary-cookies-only promise', () => {
  const policy = analyzeText(
    'We use only strictly necessary cookies before you consent to our use of cookies. We may share information with third parties.',
    'shop.example',
    'https://shop.example/privacy'
  );
  const findings = compare(buildInventory(TRACKED), policy);
  const consentFinding = findings.find((f) => f.topic === 'consent');
  assert.equal(consentFinding.severity, 'discrepancy');
  assert.equal(findings[0].severity, 'discrepancy', 'discrepancies are shown first');
});

test('policy status other than ok produces no consistency findings at all', () => {
  assert.deepEqual(compare(buildInventory(TRACKED), null), []);
});

test('markup is stripped without a DOM, since service workers have none', () => {
  const text = htmlToText('<html><head><style>a{}</style></head><body><p>We collect your <b>IP address</b>.</p><script>x()</script></body></html>');
  assert.ok(text.includes('We collect your IP address.'));
  assert.ok(!text.includes('x()'));
  assert.ok(!text.includes('<'));
});

test('the report never exposes a numeric privacy score', () => {
  const report = buildReport(TRACKED, null, false, { level: 'balanced', inherited: true });
  const serialised = JSON.stringify(report);
  assert.ok(!/"score"/.test(serialised), 'a single authoritative-looking number hides uncertainty');
  assert.equal(report.status, 'ok');
  assert.ok(report.services.every((s) => Array.isArray(s.observed)));
});
