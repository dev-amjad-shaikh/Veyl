/**
 * Veyl's central claim is that it does not overstate what it knows.
 * These tests hold it to that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPLAINER_INSTRUCTIONS,
  asPlainText,
  emptyAnalysis,
  analyzeText,
  assessExposure,
  buildDigest,
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
    harvestConfigs: [],
    harvestTransmissions: [],
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

// --- what the on-device model is allowed to see ----------------------------

test('the model is shown a digest of the report and nothing else', () => {
  const report = buildReport(TRACKED, null, false, { level: 'balanced', inherited: true });
  const digest = buildDigest(report);

  assert.ok(digest.includes('shop.example'));
  assert.ok(!digest.includes(TRACKED.url), 'the page URL is not handed to the model, only the site');
  assert.ok(!digest.includes('/product/42'), 'the path is browsing detail the model has no need for');
  assert.ok(digest.length < 8000, `digest should stay small, was ${digest.length} characters`);
});

test('the digest carries provenance and the unknowns through to the model', () => {
  const report = buildReport(TRACKED, null, false, { level: 'balanced', inherited: true });
  const digest = buildDigest(report);

  assert.match(digest, /\[observed\]|\[inferred\]/);
  assert.ok(digest.includes('WHAT VEYL CANNOT ESTABLISH'));
  assert.ok(digest.includes('Veyl has not been able to read a privacy policy'));
});

test('a clean page reaches the model as "NONE SEEN", never "NONE"', () => {
  const clean = visit({ domains: { 'fastly.net': domain('fastly.net', ['fastly']) } });
  const digest = buildDigest(buildReport(clean, null, false, { level: 'balanced', inherited: true }));

  assert.ok(digest.includes('NONE SEEN'));
  assert.ok(!/EXPOSURE: NONE$/m.test(digest));
});

test('the model is instructed to refuse the claims Veyl itself refuses', () => {
  assert.match(EXPLAINER_INSTRUCTIONS, /Never say a site sold/i);
  assert.match(EXPLAINER_INSTRUCTIONS, /cannot tell from this visit/i);
  assert.match(EXPLAINER_INSTRUCTIONS, /"None seen" means Veyl watched and saw nothing/i);
  assert.match(EXPLAINER_INSTRUCTIONS, /Never invent a company/i);
});

test('a model answer is rendered as plain text, without changing what it said', () => {
  const messy = '**Important**: they *do* share data.\n- one thing\n## Heading\nA 5 * 3 sum stays.';
  const clean = asPlainText(messy);
  assert.ok(!clean.includes('**'));
  assert.ok(clean.includes('Important: they do share data.'));
  assert.ok(clean.includes('one thing'));
  assert.ok(!clean.includes('##'));
  assert.ok(clean.includes('A 5 * 3 sum stays.'), 'arithmetic is not emphasis');
});

/**
 * The digest is the only thing the on-device model is ever shown. This plants
 * personal data everywhere the evidence layer could conceivably carry it and
 * proves none of it survives into the prompt. It is the test to run first if
 * anyone adds a field to the digest.
 */
test('nothing personal reaches the on-device model', () => {
  const personal = visit({
    site: 'clinic.example',
    url: 'https://clinic.example/patients/order?email=jane.doe%40example.com&order=A-99312',
    title: 'Order A-99312 — Jane Doe — Clinic',
    domains: {
      'doubleclick.net': domain('doubleclick.net', ['google-ad-manager']),
      'hotjar.com': domain('hotjar.com', ['hotjar']),
    },
    cookies: [
      // A cookie Veyl can name: its name is from the curated list, not the page.
      { name: '_ga', domain: 'clinic.example', thirdParty: false, session: false, lifetimeDays: 400, httpOnly: false, sameSite: 'lax', looksLikeIdentifier: true },
      // Cookies Veyl cannot name must not be listed at all.
      { name: 'patient_ref_A99312', domain: 'clinic.example', thirdParty: false, session: false, lifetimeDays: 30, httpOnly: true, sameSite: 'lax', looksLikeIdentifier: true },
      { name: 'jane.doe@example.com', domain: 'clinic.example', thirdParty: false, session: true, httpOnly: false, sameSite: 'lax', looksLikeIdentifier: false },
    ],
    storage: [
      { kind: 'localStorage', keys: 4, identifierKeys: ['user_9931_email', 'auth.jane.doe', 'basket_A-99312'] },
    ],
    signals: [{ kind: 'canvas-readback', calls: 3, firstSeenAt: 0 }],
  });

  const digest = buildDigest(buildReport(personal, null, false, { level: 'balanced', inherited: true }));

  const mustNotAppear = [
    'jane.doe@example.com', 'Jane Doe', 'jane.doe',      // an identity
    'A-99312', 'A99312',                                  // an order reference
    '/patients/order', 'email=', 'order=',                // the address and its query
    'patient_ref', 'user_9931_email', 'auth.jane', 'basket_', // unnamed cookies and storage keys
    'Order A-99312',                                      // the page title
  ];
  for (const secret of mustNotAppear) {
    assert.ok(!digest.includes(secret), `"${secret}" reached the prompt handed to the model`);
  }

  // The site itself does appear, and must: the model has to know what it is
  // talking about. It never leaves the device.
  assert.ok(digest.includes('clinic.example'));
  // Named cookies come from Veyl's own list, so they carry nothing from the page.
  assert.ok(digest.includes('_ga'));
  assert.ok(digest.includes('2 further cookies Veyl cannot identify'));
});

test('the evidence layer never even records a cookie value', () => {
  const report = buildReport(TRACKED, null, false, { level: 'balanced', inherited: true });
  const everything = JSON.stringify(report);
  assert.ok(!/"value"/.test(everything), 'a cookie value must never enter the report');
  for (const cookie of [...report.cookies.named, ...report.cookies.unnamed]) {
    assert.ok(!('value' in cookie), `${cookie.name} carries a value into the interface`);
  }
});

/**
 * Found by running Veyl over 42 real sites: on three of them it fetched a page,
 * extracted nothing at all, and then reported that the policy "does not mention"
 * sharing — a finding built from a failure to read.
 */
test('a policy that yielded no claims cannot be said to omit anything', () => {
  const unreadable = {
    ...analyzeText('This page has almost no substance to it whatsoever, and nothing matches.', 'shop.example', 'https://shop.example/privacy'),
    status: 'ok',
  };
  assert.equal(unreadable.claims.length, 0, 'fixture must extract nothing, or the test proves nothing');

  const findings = compare(buildInventory(TRACKED), unreadable);
  for (const finding of findings) {
    assert.ok(
      !(finding.severity === 'discrepancy' && /does not (say|mention)|never mentions/i.test(finding.says)),
      `claimed an omission from a policy it could not read: "${finding.says}"`
    );
  }

  // The observed half still stands: a session recorder was seen either way.
  const replay = findings.find((f) => f.topic === 'collection');
  assert.ok(replay, 'the session recorder is still reported');
  assert.equal(replay.severity, 'note');
  assert.match(replay.says, /could not read/i);
});

test('one claim from a thin document is not enough to allege an omission', () => {
  const thin = {
    ...emptyAnalysis('shop.example', 'https://shop.example/privacy', 'ok'),
    status: 'ok',
    words: 686,
    claims: [{ topic: 'cookies', assertion: 'Says third parties set cookies through this site.', quote: 'Some third-party cookies are set.', confidence: 'high' }],
  };
  for (const finding of compare(buildInventory(TRACKED), thin)) {
    assert.ok(
      !(finding.severity === 'discrepancy' && /does not (say|mention)|never mentions/i.test(finding.says)),
      `alleged an omission from a document it barely parsed: "${finding.says}"`
    );
  }

  const understood = {
    ...thin,
    claims: [
      ...thin.claims,
      { topic: 'sharing', assertion: 'Allows your information to be shared with third parties such as vendors, affiliates or partners.', quote: 'We may share your information with vendors.', confidence: 'high' },
      { topic: 'collection', assertion: 'Says it collects your browsing activity.', quote: 'We collect browsing history.', confidence: 'high' },
    ],
  };
  assert.ok(compare(buildInventory(TRACKED), understood).length > 0, 'a properly parsed policy still produces findings');
});
