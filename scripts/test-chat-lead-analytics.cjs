const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../public/widget/hotel-chat.js','utf8');
const code=source.split('// BEGIN confirmed-lead analytics')[1].split('// END confirmed-lead analytics')[0];
function harness({host='fdscards.lv',kind='fds',allowed=false,saved='[]',storageThrows=false}={}){
 const events=[],layer=[];let reads=0;const gate={isAllowed:()=>allowed};
 const window={gtag:(...a)=>events.push(a),dataLayer:{push:a=>layer.push(Array.from(a))}};
 if(kind==='academy')window.academyAnalytics=gate;else if(kind==='hexa')window.hexaAnalytics=gate;else window.yootheme={consent:{hasConsent:()=>allowed}};
 const c={window,URL,location:{hostname:host,origin:'https://'+host,pathname:'/contact',href:'https://'+host+'/contact?email=private@example.invalid&utm_source=chatgpt&utm_medium=cpc'},
 document:{querySelector:()=>({dataset:{measurement:'G-TEST123'}})},sessionStorage:{getItem:()=>{reads++;if(storageThrows)throw Error();return saved},setItem:(_,v)=>{if(storageThrows)throw Error();saved=v}}};
 vm.createContext(c);vm.runInContext(code,c);
 return{report:r=>c.reportConfirmedLead(r),grant:v=>allowed=v,events,layer,reads:()=>reads,saved:()=>saved};
}
const receipt={lead_receipt:'a'.repeat(64),email:'private@example.invalid',phone:'+12345',inquiry_id:123};
for(const kind of ['fds','hexa','academy']){
 const h=harness({kind});h.report(receipt);assert.equal(h.reads(),0);assert.equal(h.events.length+h.layer.length,0);
 h.grant(true);h.report({success:true});h.report({lead_receipt:'invalid'});assert.equal(h.events.length+h.layer.length,0);
 h.report(receipt);h.report(receipt);const events=h.events.concat(h.layer);assert.equal(events.length,1);assert.equal(events[0][1],'generate_lead');assert.equal(events[0][2].method,'chat');assert.equal(events[0][2].send_to,'G-TEST123');assert.ok(!JSON.stringify(events).includes('private@example.invalid'));assert.ok(!JSON.stringify(events).includes('inquiry_id'));assert.ok(events[0][2].page_location.includes('utm_source=chatgpt'));
 h.grant(false);h.report({lead_receipt:'b'.repeat(64)});assert.equal(h.events.length+h.layer.length,1);
 const reload=harness({kind,allowed:true,saved:h.saved()});reload.report(receipt);assert.equal(reload.events.length+reload.layer.length,0);
}
const other=harness({host:'customer.example',allowed:true});other.report(receipt);assert.equal(other.events.length,0);assert.equal(other.reads(),0);
const memory=harness({allowed:true,storageThrows:true});memory.report(receipt);memory.report(receipt);assert.equal(memory.events.length,1);
console.log('PASS: confirmed chat receipts, all three consent managers, no pre-consent storage/events, host restriction, deduplication/reload, privacy, campaign tags, storage denied. No network.');
