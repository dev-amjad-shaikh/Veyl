/**
 * "What this page can read from you" is the strongest claim Veyl makes, so it
 * carries the strictest rules: it reads the name of a parameter and never its
 * value, it never merges what a tracker declared with what was seen leaving,
 * and it says "unknown" rather than filling a gap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeFor, blockableDomains, buildDigest, buildReport, fieldsInUrl, HARVESTERS } from './.build/harness.mjs';

const HASH = 'f81b11bd0e2531b1adc629848f74d98274be0571dcac65e07462945ef8cfcbee';

function visit(overrides = {}) {
  return {
    visitId: 'v1',
    tabId: 1,
    site: 'shop.example',
    url: 'https://shop.example/newsletter',
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

function domain(name, serviceIds) {
  return {
    domain: name,
    firstSeenAt: 0,
    requests: 1,
    kinds: ['script'],
    hosts: [name],
    serviceIds,
    setCookie: false,
    beforeConsent: false,
    blocked: 0,
  };
}

const protection = { level: 'balanced', inherited: true };
const report = (v) => buildReport(v, null, false, protection);

// --- reading the name, never the value ------------------------------------

test('a request that names personal data in a parameter is read by its name', () => {
  const found = fieldsInUrl(`https://t.co/i/adsct?p_id=Twitter&email_address=${HASH}`);
  assert.deepEqual(found, [{ field: 'email', parameter: 'email_address' }]);
});

test("Meta's automatic and manual setups are both recognised, and told apart", () => {
  const automatic = fieldsInUrl(`https://www.facebook.com/tr?id=1&udff%5Bem%5D=${HASH}`);
  assert.deepEqual(automatic, [{ field: 'email', parameter: 'udff[em]' }]);

  const manual = fieldsInUrl(`https://www.facebook.com/tr?id=1&ud%5Bph%5D=${HASH}`);
  assert.deepEqual(manual, [{ field: 'phone', parameter: 'ud[ph]' }]);
});

test('several fields in one request are each reported once', () => {
  const found = fieldsInUrl(
    `https://www.facebook.com/tr?id=1&udff%5Bem%5D=${HASH}&udff%5Bzp%5D=${HASH}&udff%5Bem%5D=${HASH}`
  );
  assert.deepEqual(found.map((f) => f.field).sort(), ['email', 'postcode']);
});

test('an empty or placeholder field is not a finding', () => {
  for (const value of ['', 'undefined', 'null', 'none', 'abc']) {
    assert.deepEqual(
      fieldsInUrl(`https://t.co/i/adsct?email_address=${value}`),
      [],
      `"${value}" must not be reported as a sent email address`
    );
  }
});

test('an unrecognised parameter is never guessed at', () => {
  assert.deepEqual(fieldsInUrl(`https://tracker.example/p?mystery=${HASH}`), []);
  assert.deepEqual(fieldsInUrl(`https://tracker.example/p?e=${HASH}`), []);
});

test('the value itself is never carried into the evidence', () => {
  const url = `https://t.co/i/adsct?email_address=${HASH}`;
  const found = fieldsInUrl(url);
  assert.equal(found.length, 1);
  assert.ok(
    !JSON.stringify(found).includes(HASH),
    'the finding must record which parameter carried it, never what it carried'
  );
});

// --- declared and observed stay apart -------------------------------------

test('a declared configuration never becomes an observed claim', () => {
  const built = report(
    visit({
      domains: { 'facebook.net': domain('facebook.net', ['meta-pixel']) },
      harvestConfigs: [
        {
          entryId: 'meta-pixel',
          accountId: '1447508128842484',
          fields: ['email', 'first-name', 'date-of-birth'],
          firstSeenAt: 0,
        },
      ],
    })
  );

  const meta = built.harvest.trackers.find((h) => h.entryId === 'meta-pixel');
  assert.ok(meta, 'the Meta Pixel should appear');
  assert.deepEqual(meta.declared.map((f) => f.field), ['email', 'first-name', 'date-of-birth']);
  assert.deepEqual(meta.observed, [], 'nothing was seen leaving, so nothing is claimed to have left');
  assert.equal(meta.accountId, '1447508128842484', 'the account id makes the claim checkable');
});

test('what was seen leaving is reported even when nothing was declared', () => {
  const built = report(
    visit({
      domains: { 't.co': domain('t.co', ['x-pixel']) },
      harvestTransmissions: [
        { domain: 't.co', entryId: 'x-pixel', field: 'email', parameter: 'email_address', blocked: false, firstSeenAt: 0 },
      ],
    })
  );

  const x = built.harvest.trackers.find((h) => h.entryId === 'x-pixel');
  assert.deepEqual(x.declared, [], 'X publishes no configuration, so nothing is declared');
  assert.equal(x.observed.length, 1);
  assert.equal(x.observed[0].parameter, 'email_address');
  assert.equal(x.observed[0].blocked, false);
});

test('a blocked attempt is reported as an attempt, not as a send', () => {
  const built = report(
    visit({
      domains: { 't.co': domain('t.co', ['x-pixel']) },
      harvestTransmissions: [
        { domain: 't.co', entryId: 'x-pixel', field: 'email', parameter: 'email_address', blocked: true, firstSeenAt: 0 },
      ],
    })
  );
  assert.equal(built.harvest.trackers[0].observed[0].blocked, true);
});

// --- unknown stays unknown ------------------------------------------------

test('a harvester that publishes nothing is reported as unknown, not as none', () => {
  const built = report(
    visit({ domains: { 'googletagmanager.com': domain('googletagmanager.com', ['google-tag-manager']) } })
  );

  assert.deepEqual(built.harvest.trackers, [], 'nothing specific to say means no row');
  assert.deepEqual(built.harvest.opaque, ['Google Tag Manager']);
  assert.deepEqual(built.harvest.blocked, []);
});

test('a harvester Veyl blocked is reported as blocked, never as unknown', () => {
  const blockedDomain = { ...domain('facebook.net', ['meta-pixel']), requests: 3, blocked: 3 };
  const built = report(visit({ domains: { 'facebook.net': blockedDomain } }));

  assert.deepEqual(built.harvest.blocked, ['Meta Pixel'], 'it never loaded, so it read nothing');
  assert.deepEqual(built.harvest.opaque, [], 'blocked is a different fact from unreadable');
});

test('a harvester that got through is not reported as blocked', () => {
  const partly = { ...domain('facebook.net', ['meta-pixel']), requests: 3, blocked: 1 };
  const built = report(visit({ domains: { 'facebook.net': partly } }));

  assert.deepEqual(built.harvest.blocked, [], 'one blocked request out of three is not "it never loaded"');
  assert.deepEqual(built.harvest.opaque, ['Meta Pixel']);
});

test('a service that does not harvest forms gets no row at all', () => {
  const built = report(visit({ domains: { 'stripe.com': domain('stripe.com', ['stripe']) } }));
  assert.deepEqual(built.harvest.trackers, [], 'payments are not form harvesting');
  assert.deepEqual(built.harvest.opaque, []);
  assert.deepEqual(built.harvest.blocked, []);
});

test('only Meta is claimed to be readable; the rest are honestly opaque', () => {
  assert.equal(HARVESTERS['meta-pixel'], 'readable');
  for (const [id, kind] of Object.entries(HARVESTERS)) {
    if (id === 'meta-pixel') continue;
    assert.equal(kind, 'opaque', `${id} must not claim a readable configuration Veyl cannot read`);
  }
});

// --- what reaches the model -----------------------------------------------

test('the digest carries the field names but not the advertiser account id', () => {
  const digest = buildDigest(
    report(
      visit({
        domains: { 'facebook.net': domain('facebook.net', ['meta-pixel']) },
        harvestConfigs: [
          { entryId: 'meta-pixel', accountId: '1447508128842484', fields: ['email', 'postcode'], firstSeenAt: 0 },
        ],
      })
    )
  );

  assert.match(digest, /set up to read from forms/i);
  assert.match(digest, /email, postcode/);
  assert.ok(!digest.includes('1447508128842484'), 'the account id has no business reaching the model');
});

test('the report still holds no numeric score', () => {
  const built = report(
    visit({
      domains: { 'facebook.net': domain('facebook.net', ['meta-pixel']) },
      harvestConfigs: [{ entryId: 'meta-pixel', accountId: '1', fields: ['email'], firstSeenAt: 0 }],
    })
  );
  assert.ok(!JSON.stringify(built).includes('"score"'));
});

test("TikTok's advanced-matching endpoint is blockable, unlike TikTok itself", () => {
  const blockable = new Set(blockableDomains().map((d) => d.domain));
  assert.ok(
    blockable.has('tiktokw.us'),
    'analytics-ipv6.tiktokw.us carried a hashed email address and must not be exempt'
  );
  assert.ok(!blockable.has('tiktok.com'), "blocking TikTok's own website would break it");
});

// --- the icon ---------------------------------------------------------------
//
// Reported from real use: LinkedIn showed HIGH exposure in the panel and a
// completely unmarked icon in the toolbar. Nothing was blocked and no
// third-party tracker was seen — the level came from fingerprinting and
// retention — so the badge text was empty, and Chrome draws no badge at all
// when the text is empty. The colour never appeared.

test('a high-exposure page is marked even when there is nothing to count', () => {
  const { text, title } = badgeFor('high', 0, 0);
  assert.notEqual(text, '', 'an empty badge is invisible, not quiet');
  assert.match(title, /high exposure/);
});

test('the icon never claims nothing happened on a page Veyl rated high', () => {
  assert.doesNotMatch(badgeFor('high', 0, 0).title, /nothing here followed you/);
});

test('counts win over the mark when there is something to count', () => {
  assert.equal(badgeFor('high', 7, 0).text, '7');
  assert.equal(badgeFor('high', 7, 3).text, '3', 'what Veyl stopped is the more useful number');
});

test('a quiet page stays quiet', () => {
  assert.equal(badgeFor('none-seen', 0, 0).text, '', 'nothing found is not worth a mark');
  assert.equal(badgeFor('low', 0, 0).text, '');
});

test('a site Veyl is not watching says so rather than implying it is clean', () => {
  const { text, title } = badgeFor('unknown', 0, 0);
  assert.equal(text, '');
  assert.match(title, /not watching/);
});
