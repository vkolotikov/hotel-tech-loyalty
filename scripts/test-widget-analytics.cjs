const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/widget/hotel-chat.js', 'utf8');
const block = source.split('// BEGIN confirmed-lead analytics')[1].split('// END confirmed-lead analytics')[0];
function fixture(host, allowed, kind, store = new Map()) {
  const calls = [];
  const window = {gtag: (...args) => calls.push(args), dataLayer: {push: args => calls.push(Array.from(args))}};
  if (kind === 'academy') window.academyAnalytics = {isAllowed: () => allowed};
  else if (kind === 'hexa') window.hexaAnalytics = {isAllowed: () => allowed};
  else window.yootheme = {consent: {hasConsent: name => allowed && name === 'statistics.google_analytics'}};
  const ctx = vm.createContext({window, URL, location: new URL(`https://${host}/cards?email=private@example.test&message=secret&utm_source=google&utm_medium=cpc`),
    document: {querySelector: () => ({dataset: {measurement: 'G-TEST123'}})},
    sessionStorage: {getItem: k => store.get(k), setItem: (k,v) => store.set(k,v)}});
  vm.runInContext(block, ctx);
  return {ctx, calls, store};
}
let checks = 0;
for (const [host, kind] of [['fds-cards.co.uk','fds'],['fdscards.de','fds'],['fdscards.fr','fds'],['fdscards.es','fds'],['fdscards.lv','fds'],['fdscards.ee','fds'],
  ['hexa-academy.co.uk','academy'],['hexa-academy.lv','academy'],['hexa-tech.uk','hexa'],['beauty-tech.uk','hexa'],['hotel-tech.ai','hexa'],['gym.hexa-tech.uk','hexa'],['med.hexa-tech.uk','hexa'],['hospitality.hexa-tech.uk','hexa']]) {
  const denied=fixture(host,false,kind);
  vm.runInContext("reportWidgetAnalytics('contact_click'); reportConfirmedLead({lead_receipt:'a'.repeat(64)});",denied.ctx);
  assert.equal(denied.calls.length,0);
  const f=fixture(host,true,kind);
  vm.runInContext("reportWidgetAnalytics('contact_click'); reportConfirmedLead({});",f.ctx);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][1],'contact_click'); assert.equal(f.calls[0][2].method,'chat');
  assert.equal(f.calls[0][2].event_id,undefined);
  assert.equal(f.calls[0][2].page_location,`https://${host}/cards?utm_source=google&utm_medium=cpc`);
  vm.runInContext("reportConfirmedLead({lead_receipt:'a'.repeat(64)}); reportConfirmedLead({lead_receipt:'a'.repeat(64)});",f.ctx);
  assert.equal(f.calls.length,2); assert.equal(f.calls[1][1],'generate_lead');
  assert.equal(JSON.stringify(f.calls).includes('private@'),false);assert.equal(JSON.stringify(f.calls).includes('secret'),false);
  const reopened=fixture(host,true,kind,f.store);
  vm.runInContext("reportConfirmedLead({lead_receipt:'a'.repeat(64)}); reportWidgetAnalytics('contact_click');",reopened.ctx);
  assert.equal(reopened.calls.length,1);assert.equal(reopened.calls[0][1],'contact_click');
  checks++;
}
const external=fixture('customer.example',true,'hexa');
vm.runInContext("reportWidgetAnalytics('contact_click');reportConfirmedLead({lead_receipt:'a'.repeat(64)});",external.ctx);
assert.equal(external.calls.length,0);
assert.match(source,/btn\.onclick = function \(\) \{[\s\S]*?if \(!isOpen\).*reportWidgetAnalytics\('contact_click'\)/);
assert.doesNotMatch(source.slice(source.indexOf('function togglePanel()'),source.indexOf('function startPolling()')),/reportWidgetAnalytics/);
console.log(`${checks} owned hosts: consent, click/lead separation, receipt deduplication, privacy and external-host isolation passed. Automatic popups excluded.`);
