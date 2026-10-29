async page => {
  const base='http://127.0.0.1:5173', root='C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/scan/';
  const can={award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const tiers=[{id:1,name:'Silver',color:null,min_points:0,is_active:true}];
  const boot={name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-28',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers,ways:{checkin:true,checkin_points:10,desk_earn:true,cashback:true,cashback_percent:5,stamps:false,stamps_per_card:10}},counts:{members:1248,requests_waiting:4}};
  const member={id:1048,name:'Jamie Taylor',email:'jamie@example.test',phone:null,member_number:'M-1048',tier_id:1,points:750,lifetime_points:750,is_active:true,joined_at:'2026-01-01',last_activity_at:'2026-10-28',valid_until:'2026-11-14',membership_state:'active',credit_balance:10};
  const state={boot,member,requests:[],errors:[],denied:false,failMember:false,failScan:false,slow:false,scans:0,awards:0};
  await page.unrouteAll({behavior:'wait'});await page.context().setOffline(false);page.setDefaultTimeout(12000);
  page.removeAllListeners('pageerror');page.on('pageerror',e=>state.errors.push(e.message));
  await page.context().addInitScript(()=>{localStorage.setItem('admin_lang','en');localStorage.setItem('auth_token','scan-local-fixture');localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'scan-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));localStorage.removeItem('loyalty:scan-context');Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{throw new DOMException('Blocked for fixture','NotAllowedError')}});});
  await page.route('**/manifest.webmanifest',r=>r.fulfill({contentType:'application/manifest+json',body:'{"name":"Local fixture"}'}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/admin/loyalty/')[1]||url.pathname;let payload=null;try{payload=req.postDataJSON()}catch{}
    if(path==='__fixture'){if(payload)Object.assign(state,payload);if(payload?.releaseAward)state.awardRelease?.();return route.fulfill({contentType:'application/json',body:JSON.stringify(state)});}
    state.requests.push({path,method:req.method(),query:url.search,payload});let body={},status=200;
    if(path==='bootstrap')body=state.boot;
    else if(path==='places')body={places:[{id:1,name:'Main entrance',admits:'all',is_active:true}],can_change:true};
    else if(path==='events')body={events:[{id:5,title:'Members evening',starts_at:new Date(Date.now()-86400000).toISOString().slice(0,10)+'T00:00:00',ends_at:new Date(Date.now()+86400000).toISOString().slice(0,10)+'T23:59:00',status:'published',place:null,location:'Club',sign_up:false}]};
    else if(path==='find')body={members:url.searchParams.get('q')?.toLowerCase().includes('nobody')?[]:[state.member]};
    else if(path==='members/1048'){if(state.denied||state.failMember){status=state.denied?403:503;body={error:'forbidden'};}else body={member:state.member,benefits:[{id:1,name:'10% service discount',value:'Staff-applied · Silver benefit'},{id:2,name:'Welcome drink',value:'On request · Check benefit rules'}],requests:[]};}
    else if(path==='scan'){state.scans++;if(state.slow)await new Promise(r=>setTimeout(r,500));if(state.failScan){status=503;body={error:'unavailable'};}else body={member:state.member,...(payload.place_id||payload.event_id?{verdict:{granted:true,reason:'allowed',valid_until:'2026-11-14',expires_in_days:17,tier:tiers[0],allowed_tiers:[],place:payload.place_id?{id:1,name:'Main entrance'}:null,event:payload.event_id?{id:5,title:'Members evening'}:null},checked_in:!!payload.event_id,points:payload.event_id?10:0,benefits:[]}:{} )};}
    else if(path==='members/1048/award'||path==='members/1048/redeem'){state.awards++;if(state.holdAward)await new Promise(resolve=>{state.awardRelease=resolve});state.member.points+=path.endsWith('award')?payload.points:-payload.points;body={member:state.member};}
    else if(path.includes('entries'))body={entries:[],total:0,counts:{granted:0,denied:0}};
    else if(path.includes('people'))body={people:[],total:0,counts:{checked_in:0,signed_up:0,walk_ins:0,room_left:null}};
    else if(path.includes('check-in'))body={already_today:false,points:{checkin:10,purchase:0,balance:state.member.points+10},stamp:null,credit:null,member:state.member};
    else if(path.includes('credit'))body={balance:10,entries:[]};
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.setViewportSize({width:1440,height:1080});await page.goto(base+'/loyalty/scan');await page.locator('.l-sc-viewport').waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'render-desktop-idle.png',fullPage:false});
  return {heading:await page.locator('h1').innerText(),errors:state.errors};
}
