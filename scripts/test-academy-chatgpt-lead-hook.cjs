const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(__dirname + '/../public/widget/hotel-chat.js', 'utf8');
const code = source.split('// BEGIN confirmed-lead analytics')[1].split('// END confirmed-lead analytics')[0];

function harness({ host = 'hexa-academy.lv', google = false, advertising = false, absent = false, throws = false } = {}) {
  const calls = [], native = [], ga = [], seen = new Set();
  const adapter = { lead(receipt, method) {
    calls.push([receipt, method]);
    if (throws) throw new Error('SDK unavailable');
    // Adapter contract: independent consent and persistent receipt deduplication.
    if (!advertising || seen.has(receipt)) return false;
    seen.add(receipt); native.push([receipt, method]); return true;
  } };
  const window = {
    academyAnalytics: { isAllowed: () => google },
    gtag() {}, dataLayer: { push: args => ga.push(Array.from(args)) },
    ...(absent ? {} : { academyOpenAiAds: adapter }),
  };
  const context = {
    window, URL, location: { hostname: host, origin: 'https://' + host, pathname: '/contact', href: 'https://' + host + '/contact?email=private@example.test' },
    document: { querySelector: () => ({ dataset: { measurement: 'G-FIXTURE123' } }) },
    sessionStorage: { getItem: () => '[]', setItem() {} },
  };
  vm.createContext(context); vm.runInContext(code, context);
  return { calls, native, ga, report: data => context.reportConfirmedLead(data) };
}

const receipt = { lead_receipt: 'a'.repeat(64), email: 'private@example.test', phone: '+12345', message: 'private request', inquiry_id: 123 };

for (const host of ['hexa-academy.lv', 'hexa-academy.co.uk']) {
  const adsOnly = harness({ host, advertising: true });
  adsOnly.report(receipt); adsOnly.report(receipt);
  assert.equal(adsOnly.ga.length, 0);
  assert.deepEqual(adsOnly.calls, [[receipt.lead_receipt, 'chat'], [receipt.lead_receipt, 'chat']]);
  assert.equal(adsOnly.native.length, 1, 'Repeated receipts preserve the ID used by adapter deduplication');
  assert.ok(!JSON.stringify(adsOnly.calls).includes('private'));

  const googleOnly = harness({ host, google: true });
  googleOnly.report(receipt);
  assert.equal(googleOnly.native.length, 0, 'Google consent does not enable native advertising');
  assert.equal(googleOnly.ga.length, 1);

  const neither = harness({ host });
  neither.report(receipt);
  assert.equal(neither.native.length + neither.ga.length, 0);
}

for (const host of ['fdscards.lv', 'customer.example', 'hexa-academy.lv.customer.example']) {
  const foreign = harness({ host, advertising: true });
  foreign.report(receipt);
  assert.equal(foreign.calls.length, 0);
}
const invalid = harness({ advertising: true });
for (const data of [null, {}, { success: true }, { lead_receipt: 123 }, { lead_receipt: 'a'.repeat(63) }, { lead_receipt: 'g'.repeat(64) }]) invalid.report(data);
assert.equal(invalid.calls.length, 0, 'A chat message or success flag is not a confirmed lead receipt');

for (const options of [{ absent: true }, { throws: true }]) {
  const failure = harness({ google: true, advertising: true, ...options });
  failure.report(receipt);
  assert.equal(failure.ga.length, 1, 'Native adapter failures must not break existing Google lead reporting');
}
console.log('PASS: Academy-only confirmed HMAC receipts, independent advertising consent, stable dedup IDs, no visitor fields, failed SDK isolation. No network.');
