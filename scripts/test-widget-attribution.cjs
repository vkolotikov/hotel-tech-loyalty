const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/widget/hotel-chat.js', 'utf8');
const block = source.split('// BEGIN consented campaign journey')[1].split('// END consented campaign journey')[0];
let now = Date.parse('2026-09-12T12:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const store = new Map();
function fixture(url, referrer, allowed = true) {
  const window = {hexaAnalytics: {isAllowed: () => allowed}};
  const context = vm.createContext({cfg: {key: 'same-widget'}, window, URL, Date: Clock,
    location: new URL(url), document: {referrer},
    localStorage: {getItem: k => store.get(k), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k)}});
  vm.runInContext(block, context);
  const payload = () => JSON.parse(vm.runInContext('JSON.stringify(marketingPayload())', context));
  return {context, payload};
}
fixture('https://fdscards.lv/?utm_source=facebook&utm_medium=paid_social&utm_id=12345&email=private@example.test', '', false);
assert.equal(store.size, 0, 'Denied analytics must not write journey storage.');
let landing = fixture('https://fdscards.lv/?utm_source=facebook&utm_medium=paid_social&utm_id=12345&email=private@example.test', 'https://facebook.com/');
assert.equal(landing.payload().attribution.touches.length, 1);
assert.equal(landing.payload().attribution.touches[0].campaign_id, '12345');
now += 60000;
let page = fixture('https://fdscards.lv/contact', 'https://fdscards.lv/');
assert.equal(page.payload().attribution.touches[0].channel, 'meta', 'Opening chat later must retain the landing campaign.');
now += 86400000;
let returning = fixture('https://fdscards.lv/?utm_source=google&utm_medium=cpc&campaign_id=45678&gclid=private-click-id', '');
assert.deepEqual(returning.payload().attribution.touches.map(t => t.channel), ['meta', 'google']);
assert.equal(JSON.stringify(returning.payload()).includes('private'), false);
let revoked = fixture('https://fdscards.lv/contact', '', false);
assert.equal(revoked.payload().analytics_consent, false);
assert.equal(store.size, 0);
let social = fixture('https://fdscards.lv/?fbclid=private-click-id', '');
assert.equal(social.payload().attribution.touches[0].channel, 'social', 'fbclid is not paid-traffic evidence.');
store.clear();
let search = fixture('https://fdscards.lv/', 'https://www.google.co.uk/search?q=private');
assert.equal(search.payload().attribution.touches[0].channel, 'organic');
store.clear();
let absent = fixture('https://fdscards.lv/', '');
assert.equal(absent.payload().attribution.touches[0].channel, 'unknown', 'Missing referrer is not proof of Direct.');
store.clear();
fixture('https://unowned.test/?utm_source=google&utm_medium=cpc&utm_id=12345', '', true);
assert.equal(store.size, 0, 'Other tenants are outside portfolio marketing capture.');
for (let i = 0; i < 15; i++) { now += 3600000; fixture(`https://fdscards.lv/?utm_source=meta&utm_medium=paid_social&utm_id=${i}`, ''); }
const capped = fixture('https://fdscards.lv/contact', 'https://fdscards.lv/').payload();
assert.equal(capped.attribution.touches.length, 12);
assert.equal(capped.attribution.touches[0].campaign_id, '0');
assert.equal(capped.attribution.touches[11].campaign_id, '14');
assert.equal(capped.attribution.truncated, true);
console.log('Widget attribution passed: consent, landing-to-chat continuity, observed campaign sequence, source evidence, site scope, revocation and bounded history.');
