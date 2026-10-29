async page => {
  const base = 'http://127.0.0.1:5173', root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/card-app/';
  const can = {award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const tiers = ['Silver','Gold'].map((name,i)=>({id:i+1,name,color:null,min_points:i*1000,is_active:true}));
  const boot = {name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-28',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers},counts:{members:1248,requests_waiting:4}};
  const colors={primary:'#37b6e9',background:'#242c3b',surface:'#353f54',secondary:'#222834',text:'#f5f7fb',text_secondary:'#a6b5cd',border:'#353f54',success:'#8ddeb7',error:'#ff375f',warning:'#ffd18a',info:'#37b6e9'};
  const look={colors,card_style:'gradient',radius:16,button_style:'filled',accent_intensity:'vibrant',preset:null,logo_url:null};
  const color_modes={dark:{background:'#242c3b',surface:'#353f54',secondary:'#222834',text:'#f5f7fb',text_secondary:'#a6b5cd',border:'#353f54'},light:{background:'#f5f7fb',surface:'#ffffff',secondary:'#e8edf5',text:'#242c3b',text_secondary:'#53627a',border:'#c7d3e5'}};
  const options={colors:Object.keys(colors),card_styles:['gradient','solid','glass'],button_styles:['filled','outline','soft'],accent_intensities:['subtle','vibrant','bold'],radius:{min:0,max:32},presets:[{key:'royal_sapphire',name:'Royal Sapphire',colors:{...colors,primary:'#3b82f6'}}],logo:{max_kb:4096,max_edge:4096,types:['image/jpeg','image/png','image/webp']},color_modes};
  const wallet={apple_pass_type_id:'pass.example.loyalty',apple_team_id:'DEMO123456',apple_organization_name:'Northstar Club',apple_pass_background_color:'rgb(36,44,59)',apple_pass_foreground_color:'rgb(245,247,251)',apple_pass_label_color:'rgb(55,182,233)',apple_cert_uploaded:true,apple_cert_password_set:true,apple_wwdr_uploaded:true,apple_ready:true,google_issuer_id:null,google_class_suffix:null,google_service_account_uploaded:false,google_ready:false,is_active:true,apple_missing:[],google_missing:['issuer_id','service_account']};
  const state={boot,look,options,wallet,errors:[],requests:[],failLook:false,failWallet:false,failSummary:false,failSave:false,denied:false,slow:false,logoCount:0};
  await page.unrouteAll({behavior:'wait'}); await page.context().setOffline(false);page.setDefaultTimeout(12000);
  page.removeAllListeners('pageerror');page.on('pageerror',error=>state.errors.push(error.message));
  page.removeAllListeners('dialog');page.on('dialog',async d=>{try{if(d.type()==='beforeunload')await d.accept();else await d.dismiss()}catch{}});
  await page.context().addInitScript(()=>{localStorage.setItem('admin_lang','en');localStorage.setItem('auth_token','card-app-local-fixture');localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'card-app-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));});
  await page.route('**/manifest.webmanifest',r=>r.fulfill({contentType:'application/manifest+json',body:'{"name":"Local fixture"}'}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/admin/loyalty/')[1]||url.pathname;
    let payload=null;try{payload=req.postDataJSON()}catch{}
    if(path==='__fixture'){if(payload)Object.assign(state,payload);return route.fulfill({contentType:'application/json',body:JSON.stringify(state)});}
    state.requests.push({path,method:req.method(),query:url.search,payload});let body={},status=200;
    if(path==='bootstrap')body=state.boot;
    else if(path==='app-look'){
      if(state.slow)await new Promise(resolve=>setTimeout(resolve,600));
      if(state.denied||state.failLook||(req.method()==='PUT'&&(state.failSave||state.denySave))){status=state.denied||state.denySave?403:503;body={error:status===403?'manager_only':'unavailable'};}
      else if(req.method()==='PUT'){state.look={...state.look,...payload};body={look:state.look};}
      else body={look:state.look,options:state.options};
    }else if(path==='app-look/logo'){state.logoCount++;state.look.logo_url='/local-fixture-logo.svg';body={logo_url:state.look.logo_url};}
    else if(path==='wallet'){if(state.failWallet||state.denied){status=state.denied?403:503;body={error:'unavailable'};}else if(req.method()==='PUT'){state.wallet={...state.wallet,...payload};body={wallet:state.wallet};}else body={wallet:state.wallet};}
    else if(path.startsWith('wallet/')){if(path==='wallet/google-service-account')state.wallet.google_service_account_uploaded=true;body={wallet:state.wallet};}
    else if(path==='overview/summary'){if(state.failSummary){status=503;body={error:'unavailable'};}else body={scope:state.boot.organization.id,as_of:'2026-10-28T14:00:00Z',period:{choice:'30d'},data:{mode:'points',configured:true,options:{},tiers:state.boot.programme.tiers,rewards:3,benefits:2,offers:1,minimum_reward:{id:1,name:'Complimentary coffee',points_cost:500},setup:{done:4,total:4,steps:[]},appearance:state.look}};}
    else if(path==='currency')body={currency:'EUR',options:['EUR','GBP','USD']};
    else if(path==='find')body={members:[]};
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route('**/local-fixture-logo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#37b6e9"/><text x="12" y="33" font-size="28">N</text></svg>'}));
  await page.setViewportSize({width:1440,height:1080});await page.goto(base+'/loyalty/app');await page.locator('.l-ca-wallets').waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'render-initial.png',fullPage:false});
  return {errors:state.errors,heading:await page.locator('h1').innerText(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)};
}
