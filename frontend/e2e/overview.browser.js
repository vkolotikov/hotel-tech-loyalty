// Run with the connected Playwright browser_run_code_unsafe tool (filename), against Vite on port 5173.
// All HTTP data is deterministic and local to this test. Nothing is written to a customer account.
async (page, only = null) => {
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/';
  const can = { award:true, redeem:true, reverse:true, manage_program:true, manage_rewards:true, manage_members:true, view_insights:true, manage_campaigns:true, manage_app:true };
  const boot = { name:'HexaTech Loyalty', organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,
    venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-27',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},
    staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,tiers:[],ways:{setup_done:true}},counts:{members:1248,requests_waiting:3} };
  const base = {
    summary:{mode:'points',configured:true,options:{points_on_bookings:true,points_per_currency:10,welcome_bonus_points:250,points_expiry_months:24,tier_progress_by:'points',programme_setup_completed_at:'2026-10-01'},
      tiers:[{id:1,name:'Silver',min_points:0},{id:2,name:'Gold',min_points:1000},{id:3,name:'Platinum',min_points:1000}],rewards:6,benefits:5,offers:3,
      minimum_reward:{id:1,name:'Complimentary coffee',points_cost:500},setup:{done:7,total:7,steps:[]},appearance:{logo_url:null}},
    checks:{warnings:1,issues:[{id:'tiers_share_threshold:2-3',area:'program',code:'tiers_share_threshold',level:'warn',params:{value:1000},entities:[{id:2,name:'Gold'},{id:3,name:'Platinum'}],href:'/loyalty/program'}]},
    metrics:{mode:'points',joined:84,items:[{key:'members',value:1248,kind:'current'},{key:'rewards_used',value:143,kind:'period'},{key:'points_available',value:39800,kind:'current'}]},
    queue:{total:3,sources:['benefits','redemptions'],items:[
      {source:'benefit',id:1,status:'pending',title:'Welcome gift',member:'Casey Jordan',created_at:'2026-10-27T13:00:00Z',href:'/loyalty/requests?request=1'},
      {source:'benefit',id:2,status:'approved',title:'10% service discount',member:'Sam Lee',created_at:'2026-10-27T13:24:00Z',href:'/loyalty/requests?tab=approved&request=2'},
      {source:'redemption',id:3,status:'pending',title:'Complimentary coffee',member:'Jamie Taylor',created_at:'2026-10-27T13:37:00Z',href:'/loyalty/rewards?tab=redemptions&request=3'}]},
    activity:{filter:'all',limit:20,items:[
      {source:'points',id:1,at:'2026-10-27T13:34:00Z',member:'Alex',amount:250,kind:'earn',label:'Welcome bonus',href:'/loyalty/members/1'},
      {source:'tier',id:2,at:'2026-10-27T13:18:00Z',member:'Morgan',amount:null,kind:'tier',label:'Silver',href:'/loyalty/members/2'},
      {source:'reward',id:3,at:'2026-10-27T12:42:00Z',member:'Sam',amount:500,kind:'fulfilled',label:'Coffee reward',href:'/loyalty/rewards?tab=redemptions&request=3'}]}
  };
  const state = { org:1, mode:'points', fail:null, status:503, delay:0, limited:false, empty:false, initial:false, noActivity:false, clear:false, purchaseOff:false, routeSmoke:false, requests:[] };
  const results = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.unrouteAll({behavior:'wait'});
  await page.context().setOffline(false);
  await page.context().addInitScript(() => {
    if (sessionStorage.getItem('overview-fixture-seeded')) return;
    sessionStorage.setItem('overview-fixture-seeded','1');
    localStorage.setItem('auth_token','overview-local-fixture');
    localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'overview-local-fixture',user:{id:1,name:'Alex Morgan',email:'overview@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));
    localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));
  });
  await page.route('**/manifest.webmanifest',route=>route.fulfill({contentType:'application/manifest+json',body:'{"name":"Local test"}'}));
  await page.route('**/api/**',async route => {
    const url = new URL(route.request().url());
    const org = state.org;
    state.requests.push({path:url.pathname,query:url.search,method:route.request().method()});
    let body = {}, status = 200;
    if(url.pathname.endsWith('/bootstrap')) {
      body = structuredClone(boot);
      body.organization.id=org;body.staff.id=org;if(org!==1)body.organization.name='Workspace Two';
      if(state.limited) for(const key of ['view_insights','manage_program','manage_rewards','manage_campaigns','manage_app']) body.staff.can[key]=false;
      if(state.fail==='bootstrap'){status=state.status;body={message:'Test unavailable'};}
    } else if(url.pathname.includes('/overview/')) {
      const module = url.pathname.split('/').pop();
      const period=url.searchParams.get('period')||'30d';
      if(state.delay)await new Promise(r=>setTimeout(r,state.delay));
      if(state.fail===module) {status=state.status;body={message:'Test unavailable'};}
      else {
        const data=structuredClone(base[module]);
        if(org!==1 && ['queue','activity'].includes(module))data.items.forEach(i=>i.member='Second workspace member');
        if(module==='summary'){data.mode=state.mode;data.configured=!state.initial;if(state.mode!=='points')data.minimum_reward=null;if(state.purchaseOff){data.options.points_on_bookings=false;data.options.desk_earn_enabled=false;}}
        if(module==='checks'&&state.clear){data.warnings=0;data.issues=[];}
        if(module==='metrics') {
          data.mode=state.mode;data.joined=period==='90d'?218:period==='12m'?834:84;
          data.items[1].value=period==='90d'?367:period==='12m'?1412:143;
          if(state.mode!=='points')data.items=[data.items[0],{key:state.mode==='discounts'?'offers_used':state.mode==='visits'?'checkins':'benefits_fulfilled',value:42,kind:'period'},{key:state.mode==='discounts'?'active_offers':'active_benefits',value:3,kind:'current'}];
          if(state.empty){data.joined=0;data.items.forEach(i=>i.value=0);}
        }
        if(module==='queue'&&(state.empty||state.mode!=='points')){data.total=0;data.items=[];}
        if(module==='activity') {
          const filter=url.searchParams.get('filter');data.filter=filter;
          if(state.empty||state.noActivity||filter==='visits')data.items=[];
          else if(filter==='points')data.items=data.items.filter(i=>i.source==='points');
          else if(filter==='rewards')data.items=data.items.filter(i=>i.source==='reward');
        }
        body={scope:org,as_of:'2026-10-27T13:42:00Z',period:{choice:period,from:'2026-09-28',to:'2026-10-27',timezone:'Europe/Riga'},data};
      }
    } else if(url.pathname.endsWith('/theme'))body={theme:{}};
    else if(url.pathname.endsWith('/auth/me'))body={user:{id:1,name:'Alex Morgan',user_type:'staff'}};
    else if(url.pathname.endsWith('/find'))body={members:[{id:1,name:'Ada Lovelace',points:1500,member_number:'LS-1',tier_id:1,is_active:true}]};
    else if(url.pathname.endsWith('/requests'))body={requests:[{id:1,state:'pending',member:{id:1,name:'Casey Jordan',member_number:'LS-1'},benefit:{id:1,name:'Welcome gift'},asked_at:'2026-10-27T13:00:00Z'}],page:1,pages:1,total:1,counts:{waiting:1,approved:0,done:0}};
    else if(url.pathname.endsWith('/redemptions'))body={redemptions:[{id:3,code:'EXAMPLE-3',state:'pending',points:500,reward:{id:1,name:'Complimentary coffee'},member:{id:3,name:'Jamie Taylor',member_number:'LS-3'},at:'2026-10-27T13:37:00Z',fulfilled_at:null,cancelled_at:null}],page:1,pages:1,total:1,counts:{pending:1}};
    else if(state.routeSmoke || url.pathname.includes('/admin/loyalty/')){status=503;body={message:'Controlled route recovery check'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const check=(value,message)=>{if(!value)throw Error(message)};
  const test=async(name,fn)=>{if(only&&!new RegExp(only).test(name))return;try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});await page.keyboard.press('Escape').catch(()=>{});}};
  const reset=()=>Object.assign(state,{org:1,mode:'points',fail:null,status:503,delay:0,limited:false,empty:false,initial:false,noActivity:false,clear:false,purchaseOff:false,routeSmoke:false});
  const open=async(search='')=>{await page.goto('http://127.0.0.1:5173/loyalty/overview'+search);await page.locator('.l-ov-page').waitFor();};
  const loaded=async()=>{await page.locator('.l-ov-metric strong').first().getByText('1,248',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);};
  const shot=async(name)=>page.screenshot({path:root+name+'.png',fullPage:false});
  const noOverflow=async()=>check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal page overflow');
  await test('desktop layout, authorized navigation and exact queue links',async()=>{
    await page.setViewportSize({width:1440,height:1080});await open();await loaded();
    const box=await page.locator('.l-ov-sidebar').boundingBox();check(box.width===232,'sidebar must be 232px');
    const hero=await page.locator('.l-ov-program').boundingBox();check(Math.abs(hero.y-190)<3,'hero vertical alignment');
    const hrefs=await page.locator('.l-ov-nav a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
    for(const path of ['/loyalty','/loyalty/requests','/loyalty/program','/loyalty/options','/loyalty/rewards','/loyalty/events','/loyalty/campaigns','/loyalty/insights','/loyalty/app'])check(hrefs.includes(path),'missing route '+path);
    check(await page.locator('.l-ov-requests a').last().getAttribute('href')==='/loyalty/rewards?tab=redemptions&request=3','exact redemption destination');
    await noOverflow();await shot('desktop-1440');
  });
  await test('desktop details, preview, issues, definitions and both queues; Escape restores focus',async()=>{
    for(const [label,name]of [['Program details','program'],['Preview member view','preview'],['Review issues','issues'],['About these numbers','definitions'],['View all requests','queues']]){
      const button=page.getByRole('button',{name:label,exact:false}).first();await button.click();await page.getByRole('dialog').waitFor();
      if(name==='queues')check(await page.getByRole('dialog').getByRole('link').count()===2,'both queues');
      await shot('desktop-'+name);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(el=>el===document.activeElement,await button.elementHandle());check(await button.evaluate(b=>b===document.activeElement),'focus restore '+name);
    }
  });
  await test('all periods change period metrics and preserve current totals; activity filter clears',async()=>{
    for(const [label,value]of [['Last 90 days','367'],['Last 12 months','1,412']]){
      await page.locator('.l-ov-period > button').click();await page.getByRole('button',{name:label,exact:true}).click();
      await page.locator('.l-ov-metric strong').nth(1).getByText(value,{exact:true}).waitFor();
      check(await page.locator('.l-ov-metric strong').last().innerText()==='39,800','current balance changed');
    }
    await page.getByRole('button',{name:'View activity',exact:false}).click();await page.getByRole('button',{name:'Visits',exact:true}).click();
    await page.getByRole('dialog').getByRole('heading',{name:'No activity matches this filter'}).waitFor();await shot('activity-empty');
    await page.getByRole('dialog').getByRole('button',{name:/Clear.*filter/i}).click();await page.getByRole('dialog').getByText('Alex earned 250 points').waitFor();
    await page.keyboard.press('Escape');check(page.url().includes('period=12m'),'period lost');
  });
  // The dedicated mobile-web suite covers the new Home composition, period sheet and More navigation.
  await test('390px Home and activity dialog retain keyboard focus',async()=>{
    await page.setViewportSize({width:390,height:844});await open();await page.locator('.l-mw-metric strong').first().getByText('1,248',{exact:true}).waitFor();await noOverflow();await shot('mobile-390');
    await page.getByRole('button',{name:/View activity/}).click();await page.getByRole('dialog').waitFor();
    for(let i=0;i<18;i++){await page.keyboard.press('Tab');check(await page.evaluate(()=>document.activeElement.closest('dialog')!==null),'focus escaped dialog');}
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  });
  await test('320, 768, 1024 and landscape layouts; no horizontal overflow',async()=>{
    for(const [width,height] of [[320,740],[768,1024],[1024,900],[844,390]]){await page.setViewportSize({width,height});await noOverflow();await shot('layout-'+width);}
    await page.setViewportSize({width:1024,height:900});check(await page.locator('.l-ov-sidebar').isVisible(),'compact sidebar hidden');
  });
  await test('discount, visit and service modes have relevant metrics',async()=>{
    await page.setViewportSize({width:1440,height:1080});state.clear=true;
    for(const mode of ['discounts','visits','services']){state.mode=mode;await open();await loaded();check(!await page.locator('.l-ov-metrics').getByText('Points available',{exact:true}).count(),'irrelevant points');await shot('mode-'+mode);}
    reset();
  });
  await test('partial module failure and retry preserve healthy sections',async()=>{
    state.fail='metrics';await open('?period=90d');await page.locator('.l-ov-glance').getByRole('button',{name:'Try again'}).waitFor();
    check(await page.locator('.l-ov-metric strong').first().innerText()==='—','failed metric not dash');
    check(await page.locator('.l-ov-requests li').count()===3,'healthy queue lost');await shot('partial-metrics');
    state.fail=null;await page.locator('.l-ov-glance').getByRole('button',{name:'Try again'}).click();await loaded();check(page.url().includes('period=90d'),'retry lost period');
    for(const module of ['queue','checks','activity']){state.fail=module;await open();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
      const region=page.locator(module==='queue'?'.l-ov-queue':module==='checks'?'.l-ov-attention':'.l-ov-activity');
      check(!/all caught up|checks are clear|No recent activity/.test(await region.innerText()),'failure masquerades as empty');}
    reset();
  });
  await test('loading and global context failure never fabricate zeros',async()=>{
    state.delay=1400;await open();await page.locator('.l-ov-skeleton').first().waitFor();check(!await page.locator('.l-ov-metric strong').count(),'loading shows a number');await shot('loading');await loaded();
    state.delay=0;state.fail='bootstrap';await open();await page.getByRole('heading',{name:'Overview could not load'}).waitFor();await shot('global-error');reset();
  });
  await test('limited staff make no analytics reads; explicit denial reveals no old numbers',async()=>{
    state.limited=true;state.requests=[];await open();await page.getByRole('heading',{name:'Your team workspace'}).waitFor();await page.locator('.l-ov-requests li').first().waitFor();
    check(!state.requests.some(r=>/overview\/(metrics|activity)/.test(r.path)),'limited staff requested analytics');await shot('restricted');
    reset();state.fail='metrics';state.status=403;await open();await page.getByText('This view is unavailable for your access',{exact:true}).waitFor();check(!await page.locator('.l-ov-metric').getByText('1,248').count(),'denied totals visible');reset();
  });
  await test('empty configuration and membership are distinct from failed reads',async()=>{
    state.initial=true;await open();await page.getByRole('heading',{name:'Welcome to your loyalty workspace'}).waitFor();check(await page.getByRole('link',{name:'Start setup'}).getAttribute('href')==='/loyalty/options/setup','wizard destination');await shot('first-setup');
    state.initial=false;state.empty=true;await open();await page.getByRole('heading',{name:'No members yet'}).waitFor();await shot('no-members');reset();
  });
  await test('offline retains labeled values and search uses the existing member search',async()=>{
    await open();await loaded();await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
    await page.getByText('You are offline',{exact:true}).waitFor();check((await page.locator('.l-ov-updated').innerText()).includes('Saved data'),'unlabeled cache');await shot('offline');
    await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});
    await page.getByRole('button',{name:'Find a member or action',exact:true}).click();await page.getByRole('combobox').fill('Ada');await page.getByText('Ada Lovelace',{exact:false}).first().waitFor();await page.keyboard.press('Escape');
  });
  await test('rapid period selection cannot be overwritten by a late response',async()=>{
    await page.setViewportSize({width:1440,height:1080});await open();await loaded();state.delay=600;
    await page.locator('.l-ov-period > button').click();
    const pending=page.waitForRequest(r=>r.url().includes('/overview/metrics')&&r.url().includes('period=90d'));
    await page.getByRole('button',{name:'Last 90 days',exact:true}).click();await pending;state.delay=20;
    await page.locator('.l-ov-period > button').click();await page.getByRole('button',{name:'Last 12 months',exact:true}).click();
    await page.locator('.l-ov-metric strong').nth(1).getByText('1,412',{exact:true}).waitFor();await page.waitForTimeout(650);
    check(await page.locator('.l-ov-metric strong').nth(1).innerText()==='1,412','late response replaced latest selection');reset();
  });
  await test('permission removal clears previously visible analytics',async()=>{
    await open();await loaded();state.fail='metrics';state.status=403;
    await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
    await page.getByText('This view is unavailable for your access',{exact:true}).waitFor();
    check(!await page.locator('.l-ov-metrics').getByText('1,248',{exact:true}).count(),'previously authorized total leaked');await shot('permission-removed');reset();
  });
  await test('identity change during a pending request never displays the previous workspace',async()=>{
    state.delay=600;await open();await page.locator('.l-ov-skeleton').first().waitFor();state.org=2;state.delay=20;
    await page.evaluate(()=>{
      localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'overview-second-fixture',user:{id:2,name:'Second user',email:'second@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));
      localStorage.setItem('auth_token','overview-second-fixture');
      window.dispatchEvent(new StorageEvent('storage',{key:'loyalty-auth'}));
    });
    await page.locator('.l-ov-workspace').getByText('Workspace Two',{exact:true}).waitFor();await page.locator('.l-ov-requests').getByText('Second workspace member',{exact:false}).first().waitFor();
    await page.waitForTimeout(650);check(!(await page.locator('.l-ov-page').innerText()).includes('Casey Jordan'),'old member flashed back');reset();await page.evaluate(()=>sessionStorage.removeItem('overview-fixture-seeded'));await open();await loaded();
  });
  await test('existing theme and language controls, long translations and zoom-equivalent layout',async()=>{
    await page.setViewportSize({width:1440,height:1080});await open();await loaded();
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Light',exact:true}).click();
    check(await page.locator('[data-overview]').getAttribute('data-theme')==='light','light theme failed');await page.keyboard.press('Escape');await page.waitForTimeout(350);await shot('light-theme');
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Auto',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Dark',exact:true}).click();await page.keyboard.press('Escape');
    await page.setViewportSize({width:1440,height:1080});
    for(const lang of ['de','ru','fr','es']) {
      await page.getByRole('button',{name:/^(Settings|Настройки|Einstellungen|Réglages|Configuración|Ajustes)$/}).click();await page.getByRole('combobox',{name:/Language|Язык|Sprache|Langue|Idioma/}).selectOption(lang);await page.keyboard.press('Escape');
      await page.setViewportSize({width:390,height:844});await noOverflow();await shot('mobile-'+lang);await page.setViewportSize({width:1440,height:1080});
    }
    await page.getByRole('button',{name:/^(Settings|Настройки|Einstellungen|Réglages|Configuración|Ajustes)$/}).click();await page.getByRole('combobox',{name:/Language|Язык|Sprache|Langue|Idioma/}).selectOption('en');await page.keyboard.press('Escape');
    await page.setViewportSize({width:720,height:540});
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:720,height:540,deviceScaleFactor:2,mobile:false,screenWidth:1440,screenHeight:1080});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    check(await page.evaluate(()=>innerWidth===720),'zoom equivalent CSS viewport');
    await noOverflow();await shot('zoom-equivalent-200');await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
  });
  await test('preview preserves disabled purchase earning and local assets load',async()=>{
    await page.setViewportSize({width:1440,height:1080});state.purchaseOff=true;await open();await loaded();
    check(await page.locator('img').evaluateAll(nodes=>nodes.every(n=>n.complete&&n.naturalWidth>0)),'broken local asset');
    check(await page.evaluate(()=>[400,500,600].every(w=>document.fonts.check(w+' 14px "L Poppins"'))),'Poppins weight missing');
    await page.getByRole('button',{name:'Preview member view',exact:true}).click();await page.getByRole('dialog').getByText('Purchase earning is off',{exact:true}).waitFor();await page.keyboard.press('Escape');reset();
  });
  // Exact queue destinations are asserted above; current Requests/Rewards suites exercise their updated workflows.
  await test('all existing primary routes retain their shell and Overview navigation',async()=>{
    state.routeSmoke=true;
    for(const path of ['','requests','program','options','options/setup','rewards','events','campaigns','insights','scan','app','guide','start']){
      await page.goto('http://127.0.0.1:5173/loyalty'+(path?'/'+path:''));await page.locator('[data-frame-footer]').waitFor();
      check(await page.locator('.l-overview-frame').isVisible(),'shared workspace shell missing from '+path);
      check(!await page.getByText('This page could not be shown. What you saved is safe.',{exact:true}).count(),'page boundary failed on '+path);
      check(await page.getByRole('link',{name:'Overview',exact:true}).count()>0,'Overview unreachable from '+path);await noOverflow();
    }
    reset();await open();await loaded();
  });
  await test('collapsed desktop navigation and long mobile content remain usable',async()=>{
    await page.setViewportSize({width:1440,height:1080});await open();await loaded();
    await page.getByRole('button',{name:/Alex Morgan/}).click();await page.getByRole('menuitem',{name:'Collapse menu',exact:true}).click();
    check((await page.locator('.l-ov-sidebar').boundingBox()).width===76,'collapse did not take effect');await noOverflow();
    await page.getByRole('button',{name:/Alex Morgan/}).click();await page.getByRole('menuitem',{name:'Expand menu',exact:true}).click();
    const original=structuredClone(base.queue.items[0]);const originalCount=base.metrics.items[0].value;
    try {
      base.queue.items[0].member='Alexandra Anastasia Montgomery-Sutherland';base.queue.items[0].title='Complimentary signature experience for two visiting members';base.metrics.items[0].value=999999999;
      await page.setViewportSize({width:320,height:740});await open();await page.getByText('999,999,999',{exact:true}).waitFor();await noOverflow();await shot('long-content-320');
    } finally {base.queue.items[0]=original;base.metrics.items[0].value=originalCount;}
    await page.setViewportSize({width:1440,height:1080});await open();await loaded();
  });
  await test('all Overview requests are reads scoped to all brands',async()=>{
    const requests=state.requests.filter(r=>r.path.includes('/admin/loyalty/'));
    check(requests.length>0,'no requests recorded');check(requests.every(r=>r.method==='GET'),'Overview wrote data');
    check(requests.every(r=>new URLSearchParams(r.query).get('brand_id')==='all'),'brand scope missing');
  });
  return {results,pageErrors:errors,passed:results.filter(r=>r.status==='PASS').length,total:results.length};
}
