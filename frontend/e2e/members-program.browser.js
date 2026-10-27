// Connected Playwright harness. All API requests, including writes, are fulfilled locally.
async (page) => {
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/members-program/';
  const can = { award:true, redeem:true, reverse:true, manage_program:true, manage_rewards:true, manage_members:true, view_insights:true, manage_campaigns:true, manage_app:true };
  const benefits = [
    {id:1,benefit_id:1,name:'Welcome drink',category:'dining',value:null,value_type:'free_item',value_amount:null,applies_to:'all'},
    {id:2,benefit_id:2,name:'10% service discount',category:'discount',value:'10% off · services only',value_type:'percent_discount',value_amount:10,applies_to:'services'},
    {id:3,benefit_id:3,name:'Priority booking',category:'recognition',value:null,value_type:'text',value_amount:null,applies_to:'all'},
    {id:4,benefit_id:4,name:'Late checkout',category:'accommodation',value:'Until 2 pm',value_type:'text',value_amount:null,applies_to:'stays'},
  ];
  const tiers = ['Bronze','Silver','Gold'].map((name,i)=>({id:i+1,name,color:['#c7d3e5','#37b6e9','#ffd18a'][i],min_points:i*1000,min_visits:null,min_spend:null,min_nights:null,min_stays:null,earn_rate:1+i*.25,is_active:true,sort_order:i,members:[960,240,48][i],description:i===2?'More rewards for our most loyal members.':null,benefits:benefits.slice(0,[1,3,4][i])}));
  const program = {tiers,benefits:benefits.map(b=>({id:b.benefit_id,name:b.name,code:'benefit_'+b.id,description:'Subject to the benefit’s existing rules.',category:b.category,fulfillment_mode:b.id===1?'on_request':'staff_approved',is_active:true,sort_order:b.id})).concat([{id:5,name:'Stay discount',code:'stay_discount',description:'A discount on eligible stays.',category:'discount',fulfillment_mode:'automatic',is_active:true,sort_order:5}]),boosts:[],advice:[],options:{categories:['dining','discount','accommodation','recognition'],fulfillment_modes:['automatic','on_request','staff_approved'],value_types:['text','percent_discount','fixed_amount','points_multiplier','free_item'],applies_to:['all','services','stays']}};
  const boot = {name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-27',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers,ways:{setup_done:true,stamps_enabled:false,checkin_enabled:false,desk_earn_enabled:false,cashback_enabled:false}},counts:{members:1248,requests_waiting:1}};
  const names=['Jamie Taylor','Alex Rivera','Morgan Lee','Casey Jordan','Sam Lee','Robin Blake','Avery Chen','Drew Parker','Skyler Cole','Quinn West'];
  const rows=names.map((name,i)=>({id:i+1,name,email:name.toLowerCase().replace(' ','.')+'@example.test',phone:null,member_number:'M-'+(1048+i),tier_id:[2,1,3,2,1,2,1,3,1,2][i],points:[750,250,2400,1050,120,680,0,3100,80,920][i],lifetime_points:i===0?1250:2000,is_active:i!==8,joined_at:'2026-10-'+String(12-i).padStart(2,'0')+'T09:00:00Z',last_activity_at:i===6?null:'2026-10-27T07:42:00Z',membership_state:i===3?'expiring':i===5?'expired':i===8?'off':'active',valid_until:i===0?'2026-11-14':null}));
  const detail={member:{...rows[0],qualifying_points:1250,referral_code:'EXAMPLE',language:'en',nationality:null,date_of_birth:null,marketing_consent:false,sms_consent:false,tier_override_until:null,is_erased:false},progress:{by:'points',qualifying:1250,next_tier:{id:3,name:'Gold',min_points:2000,floor:2000},needed:750,percent:62.5},benefits:benefits.slice(0,3).map(b=>({...b,description:'Available to this level, subject to the benefit’s rules.',fulfillment_mode:b.id===1?'on_request':'staff_approved'})),requests:[{id:42,state:'pending',member:{id:1,name:'Jamie Taylor',member_number:'M-1048'},benefit:{id:1,name:'Welcome gift',category:'recognition'},asked_at:'2026-10-27T07:00:00Z',fulfilled_at:null,decline_reason:null}],options:{languages:['en','ru','de','fr','es']}};
  const lines=[{id:1,type:'bonus',points:250,description:'Welcome bonus',at:'2026-10-27T07:42:00Z'},{id:2,type:'redeem',points:-500,description:'Coffee reward',at:'2026-10-25T12:05:00Z'},{id:3,type:'earn',points:1000,description:'Purchase points',at:'2026-10-24T09:16:00Z'},{id:4,type:'earn',points:50,description:'Earlier purchase',at:'2026-10-20T09:00:00Z'}].map(x=>({...x,balance_after:null,by:null,is_reversed:false,reversal_of_id:null,can_reverse:true}));
  const state={requests:[],errors:[],fail:null,writeFail:false,limited:false,empty:false,slow:false,program,detail,rows,lines,boot};
  
  await page.unrouteAll({behavior:'wait'});
  await page.context().setOffline(false);
  page.on('pageerror',e=>state.errors.push(e.message));
  await page.context().addInitScript(()=>{
    localStorage.setItem('auth_token','members-program-local-fixture');
    localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'members-program-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));
    localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));
  });
  await page.route('**/manifest.webmanifest',route=>route.fulfill({contentType:'application/manifest+json',body:'{"name":"Local test"}'}));
  await page.route('**/api/**',async route=>{
    const request=route.request(), url=new URL(request.url()), path=url.pathname.split('/admin/loyalty/')[1]||url.pathname;
    const method=request.method(); let payload=null;try{payload=request.postDataJSON()}catch{}
    state.requests.push({path,query:url.search,method,payload});
    if(state.slow)await new Promise(r=>setTimeout(r,700));
    let body={},status=200;
    if(path==='__fixture'){if(payload)Object.assign(state,payload);body=state;}
    else if(state.fail && path.includes(state.fail)){status=503;body={error:'unavailable'};}
    else if(method!=='GET' && state.writeFail){status=422;body={error:'invalid',errors:{name:['A test validation error']}};}
    else if(path==='bootstrap'){body=structuredClone(boot);if(state.limited)Object.keys(body.staff.can).forEach(k=>body.staff.can[k]=false);}
    else if(path==='program'&&method==='GET')body=state.empty?{...program,tiers:[],benefits:[]}:program;
    else if(path==='places')body={places:[],options:{tiers}};
    else if(path==='start')body={done:7,total:7,steps:[]};
    else if(path==='members'&&method==='GET'){
      let filtered=state.empty?[]:rows.filter(m=>(!url.searchParams.get('q')||m.name.toLowerCase().includes(url.searchParams.get('q').toLowerCase()))&&(!url.searchParams.get('tier_id')||m.tier_id===Number(url.searchParams.get('tier_id'))));
      const per=Number(url.searchParams.get('per_page')||50),n=Number(url.searchParams.get('page')||1);
      body={members:filtered,page:n,pages:Math.ceil(1248/per),total:filtered.length?1248:0,per_page:per,figures:{total:1248,active:1192,new_this_month:84,average_points:32,tiers:{1:960,2:240,3:48},expiring:1,expired:1}};
    }else if(/^members\/\d+$/.test(path)&&method==='GET')body=detail;
    else if(path==='members/1/history'){
      const filtered=lines.filter(l=>!url.searchParams.get('type')||l.type===url.searchParams.get('type'));
      body={lines:filtered,page:1,pages:1,total:filtered.length};
    }else if(path==='members/1/cards')body={cards:[]};
    else if(path==='members/1/stamps')body={cards:[],enabled:false};
    else if(path.endsWith('/auth/subscription'))body={subscription:null};
    else if(path==='members/1/award'||path==='members/1/redeem'){
      const delta=(path.endsWith('/award')?1:-1)*payload.points;detail.member.points+=delta;rows[0].points=detail.member.points;lines.unshift({id:lines.length+1,type:delta>0?'earn':'redeem',points:delta,description:payload.reason,at:'2026-10-27T10:00:00Z',balance_after:detail.member.points,by:'Alex Morgan',is_reversed:false,reversal_of_id:null,can_reverse:true});body={points:detail.member.points};
    }else if(/^program\/tiers\/\d+$/.test(path)&&method==='PUT'){Object.assign(tiers.find(t=>t.id===Number(path.split('/')[2])),payload);body={tier:tiers.find(t=>t.id===Number(path.split('/')[2]))};}
    else if(/^program\/tiers\/\d+\/benefits$/.test(path)&&method==='POST'){
      const tier=tiers.find(t=>t.id===Number(path.split('/')[2])),def=program.benefits.find(b=>b.id===payload.benefit_id);let tb=tier.benefits.find(b=>b.benefit_id===payload.benefit_id);if(!tb){tb={id:90+payload.benefit_id,name:def.name,category:def.category};tier.benefits.push(tb)}Object.assign(tb,payload);body={benefit:tb};
    }else if(path==='requests')body={requests:detail.requests,page:1,pages:1,total:1,counts:{waiting:1,approved:0,done:0}};
    else if(path.endsWith('/theme'))body={theme:{}};
    else if(path.endsWith('/auth/me'))body={user:{id:1,name:'Alex Morgan',user_type:'staff'}};
    else if(path==='find')body={members:rows.slice(0,2)};
    else {status=503;body={error:'fixture_missing',message:'Local fixture does not define this endpoint.'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.setViewportSize({width:1440,height:1080});
  const open=async path=>{await page.goto('http://127.0.0.1:5173'+path);await page.locator('.l-rd-page').waitFor();await page.evaluate(()=>document.fonts.ready);};
  await open('/loyalty?state=all');await page.getByRole('link',{name:'Jamie Taylor jamie.taylor@example.test'}).waitFor();
  await page.screenshot({path:root+'render-members-initial.png',fullPage:true});
  await open('/loyalty/members/1');await page.getByRole('heading',{name:'Jamie Taylor'}).waitFor();
  await page.screenshot({path:root+'render-profile-initial.png',fullPage:true});
  await page.getByRole('button',{name:'Award points',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.getByRole('spinbutton',{name:'Points to add',exact:true}).fill('250');await page.getByLabel('Reason',{exact:true}).fill('Thank you for visiting us');
  await page.getByRole('heading',{name:'Award points',exact:true}).click();await page.screenshot({path:root+'render-award-initial.png',fullPage:true});await page.keyboard.press('Escape');
  await open('/loyalty/program');await page.getByRole('heading',{name:'Gold',exact:true}).waitFor();
  await page.screenshot({path:root+'render-levels-initial.png',fullPage:true});
  await page.getByRole('button',{name:'Edit level Gold',exact:true}).click();await page.getByRole('heading',{name:'Edit Gold level'}).waitFor();
  await page.screenshot({path:root+'render-edit-level-initial.png',fullPage:true});
  await page.getByRole('button',{name:'+ Add benefit',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.getByRole('combobox',{name:'Benefit',exact:true}).selectOption('5');await page.getByRole('combobox',{name:'Value type',exact:true}).selectOption('percent_discount');
  await page.getByRole('spinbutton',{name:'Discount (%)',exact:true}).fill('10');await page.getByRole('combobox',{name:'Applies to',exact:true}).selectOption('stays');await page.getByLabel('Wording shown to members',{exact:true}).fill('10% off eligible stays');
  await page.screenshot({path:root+'render-add-benefit-initial.png',fullPage:true});
  return {errors:state.errors,missing:state.requests.filter(r=>r.path[0]==='/'),requests:state.requests.length};
}
