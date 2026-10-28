// Local API fixtures only. No production requests or member mutations.
async (page) => {
  const base = 'http://127.0.0.1:5173';
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/insights/';
  const can = {award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const tiers = ['Bronze','Silver','Gold'].map((name,i)=>({id:i+1,name,color:null,min_points:i*1000,is_active:true}));
  const boot = {name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-28',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers},counts:{members:1248,requests_waiting:4}};

  const days=['2026-09-30','2026-10-07','2026-10-14','2026-10-21'], ends=['2026-10-06','2026-10-13','2026-10-20','2026-10-27'];
  const money=(total)=>({period:'custom',bucket:'week',from:days[0],to:ends[3],timezone:'Europe/Riga',currency:'EUR',members:{stays:{bookings:600,amount:total-3000},services:{bookings:104,amount:3000},total},all:{total:40000},share:62.2,other_currency:{bookings:0},series:days.map((key,i)=>({key,stays:[4000,4500,5500,7860][i],services:750}))});
  const current={members:1248,active:612,new_members:84,participation:49,issued:124800,redeemed:78500,expired:6300,claims:184,fulfilled:158,pending:26,cancelled:0,fulfilment:85.9,money:money(24860)};
  const previous={...current,members:1164,active:540,new_members:70,participation:46.4,issued:112000,redeemed:70400,claims:162,fulfilment:83.3,money:money(22934)};
  const report={from:days[0],to:ends[3],days:28,timezone:'Europe/Riga',updated_at:'2026-10-28T06:15:00Z',snapshot_date:'2026-10-28',tier_id:null,comparison:{from:'2026-09-02',to:'2026-09-29'},current,previous,series:days.map((from,i)=>({from,to:ends[i],active:[210,238,252,286][i],sales:[4000,4500,5500,10860][i]})),previous_series:['2026-09-02','2026-09-09','2026-09-16','2026-09-23'].map((from,i)=>({from,to:['2026-09-08','2026-09-15','2026-09-22','2026-09-29'][i],active:[180,200,205,240][i],sales:[3500,4000,5000,10434][i]})),tiers:{rows:[{id:1,name:'Bronze',members:960},{id:2,name:'Silver',members:240},{id:3,name:'Gold',members:48}],none:0,total:1248},outstanding:1040000,rewards:[{id:1,name:'Complimentary coffee',claims:96},{id:2,name:'Guest pass',claims:52},{id:3,name:'Welcome reward',claims:36}],cohorts:days.map((from,i)=>({from,to:ends[i],members:[18,20,22,24][i],returns:[[11,9,8],[12,9,null],[12,null,null],[null,null,null]][i]})),attention:{expiring:18500,expiring_members:47,expiry_from:'2026-10-28',expiry_to:'2026-11-26',quiet:92}};
  const state={boot,report,errors:[],requests:[],fail:false,denied:false,limited:false,slow:false};
  await page.unrouteAll({behavior:'wait'}); await page.context().setOffline(false); page.setDefaultTimeout(12000);
  page.removeAllListeners('pageerror'); page.on('pageerror',e=>state.errors.push(e.message));
  page.removeAllListeners('dialog'); page.on('dialog',async d=>{try{if(d.type()==='beforeunload')await d.accept();else await d.dismiss()}catch{}});
  await page.context().addInitScript(()=>{localStorage.setItem('admin_lang','en');localStorage.setItem('auth_token','requests-local-fixture');localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'requests-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));});
  await page.route('**/manifest.webmanifest',r=>r.fulfill({contentType:'application/manifest+json',body:'{"name":"Local test"}'}));

  await page.route('**/api/**',async route=>{
    const request=route.request(), url=new URL(request.url()), path=url.pathname.split('/admin/loyalty/')[1]||url.pathname;
    let payload=null;try{payload=request.postDataJSON()}catch{}
    if(path==='__fixture'){if(payload)Object.assign(state,payload);return route.fulfill({contentType:'application/json',body:JSON.stringify(state)});}
    state.requests.push({path,method:request.method(),query:url.search});
    let body={},status=200;
    if(path==='bootstrap'){body=structuredClone(state.boot);if(state.limited)body.staff.can.view_insights=false;}
    else if(path==='insights/report'){
      if(state.slow)await new Promise(r=>setTimeout(r,800));
      if(state.fail||state.denied){status=state.denied?403:503;body={error:state.denied?'not_allowed':'unavailable'};}
      else{body=structuredClone(state.report);const q=url.searchParams;body.from=q.get('from')||body.from;body.to=q.get('to')||body.to;body.days=(Date.parse(body.to)-Date.parse(body.from))/86400000+1;if(q.get('compare')==='none'){body.previous=null;body.comparison=null;body.previous_series=[];}if(q.get('tier_id')){body.tier_id=Number(q.get('tier_id'));body.current.active=120;}}
    }else if(path==='find')body={members:[]};
    else if(path==='insights')body={period:'30d',bucket:'day',from:'2026-09-29',to:'2026-10-28',timezone:'Europe/Riga',tiles:{members:1248,new_members:84,active_members:612,outstanding:1040000,issued:124800,redeemed:78500,expired:6300,redemption_rate:62.9},growth:[],points:[],redemptions:[],tiers:{rows:[],none:0},movement:{up:0,down:0,lateral:0,flows:[]},expiry:{overdue:{points:0,members:0},months:[]},engagement:{new:0,active:0,at_risk:0,dormant:0},balances:[]};
    else if(path==='insights/money')body=money(24860);
    else if(path==='insights/cohorts')body={timezone:'Europe/Riga',months:[],rows:[]};
    else if(path==='insights/at-risk')body={days:30,total:0,limit:100,members:[]};
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.setViewportSize({width:1440,height:1080});await page.goto(base+'/loyalty/insights');await page.locator('.l-in-tiles').waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'render-dashboard.png',fullPage:true});
  await page.getByRole('button',{name:/^Reporting period:/}).click();await page.locator('dialog[open]').waitFor();await page.locator('dialog[open]').screenshot({path:root+'render-filters.png'});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Definitions',exact:true}).click();await page.locator('dialog[open]').waitFor();await page.locator('dialog[open]').screenshot({path:root+'render-definitions.png'});await page.keyboard.press('Escape');
  return {screens:3,errors:state.errors};
}
