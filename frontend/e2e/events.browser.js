// Local fixture only: every API request, including writes, is intercepted.
async (page) => {
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/events/';
  const base = 'http://127.0.0.1:5173';
  const tiers = ['Bronze','Silver','Gold'].map((name,i)=>({id:i+1,name,color:null,min_points:i*1000,is_active:true}));
  const can = {award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const boot = {name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-11-08',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers},counts:{members:1248,requests_waiting:0}};
  const row = (id,title,start,end,place,registered,capacity) => ({id,title,description:null,starts_at:start,ends_at:end,place:{id,name:place},location:null,admits:'all',tiers:[],points:100,counts_as_visit:true,sign_up:true,walk_ins:true,capacity,status:'published',phase:'upcoming',counts:{signed_up:registered,checked_in:18,walk_ins:0,room_left:capacity-registered,not_checked_in:registered-18}});
  const events = [row(1,'Members’ evening','2026-11-08T18:00','2026-11-08T20:00','Northstar Lounge',32,40),row(2,'Coffee masterclass','2026-11-14T10:00','2026-11-14T12:00','Northstar Café',24,24),row(3,'Wellness weekend','2026-11-20T09:00','2026-11-22T18:00','Northstar Spa',12,30)];
  const people = ['Jamie Taylor','Morgan Lee','Alex Rivera','Casey Jordan','Sam Lee','Taylor Kim'].map((name,i)=>({member:{id:100+i,name,member_number:'M-'+[1048,1035,1049,1040,1055,1060][i],tier:tiers[[1,2,0,1,0,2][i]]},signed_up_at:'2026-11-01T09:00:00Z',cancelled_at:null,checked_in_at:i===1?'18:04':i===3?'18:08':null,walk_in:false,source:'portal',points_awarded:i===1?100:i===3?0:null,points_reversed:false}));
  const options={places:events.map(e=>({...e.place,is_active:true})),locations:['Rooftop']};
  const state={boot,events,people,options,requests:[],errors:[],limited:false,empty:false,fail:'',writeFail:false,fieldFail:null,slow:false};
  await page.unrouteAll({behavior:'wait'});await page.context().setOffline(false);page.setDefaultTimeout(10000);
  page.on('pageerror',e=>state.errors.push(e.message));
  page.removeAllListeners('dialog');page.on('dialog',async d=>{try{if(d.type()==='beforeunload')await d.accept();else await d.dismiss()}catch{}});
  await page.context().addInitScript(()=>{localStorage.setItem('admin_lang','en');localStorage.setItem('auth_token','events-local-fixture');localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'events-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));});
  await page.route('**/manifest.webmanifest',r=>r.fulfill({contentType:'application/manifest+json',body:'{"name":"Local test"}'}));
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname.split('/admin/loyalty/')[1]||url.pathname,method=request.method(),q=url.searchParams;
    let payload=null;try{payload=request.postDataJSON()}catch{}
    if(path==='__fixture'){if(payload)Object.assign(state,payload);return route.fulfill({contentType:'application/json',body:JSON.stringify(state)})}
    state.requests.push({path,method,payload,query:url.search});if(state.slow&&method!=='GET')await new Promise(r=>setTimeout(r,1500));
    let body={},status=200;const fail=code=>{status=code;body={error:code===403?'not_allowed':code===404?'not_found':'unavailable'}};
    if(state.fail===path)fail(503);else if(state.limited&&method!=='GET')fail(403);else if(state.writeFail&&method!=='GET')fail(503);else if(state.fieldFail&&method!=='GET'){status=422;body={message:'Invalid',errors:state.fieldFail}}
    else if(path==='bootstrap'){body=structuredClone(state.boot);if(state.limited)Object.keys(body.staff.can).forEach(k=>body.staff.can[k]=false)}
    else if(path==='events'&&method==='GET'){
      const tab=q.get('when')||'upcoming';let list=state.empty?[]:state.events.filter(e=>tab==='drafts'?e.status==='draft':tab==='past'?e.phase==='ended':e.status!=='draft'&&e.phase!=='ended');
      if(q.get('q'))list=list.filter(e=>e.title.toLowerCase().includes(q.get('q').toLowerCase()));if(q.get('place_id'))list=list.filter(e=>String(e.place?.id)===q.get('place_id'));if(q.get('location'))list=list.filter(e=>e.location===q.get('location'));if(q.get('tier_id'))list=list.filter(e=>e.admits==='all'||e.tiers.some(t=>String(t.id)===q.get('tier_id')));if(q.get('sort')==='latest')list=[...list].reverse();
      body={events:list,page:1,pages:1,total:list.length,totals:{upcoming:state.events.filter(e=>e.status==='published').length,past:0,drafts:state.events.filter(e=>e.status==='draft').length},can_change:!state.limited,options:state.options};
    }else if(path==='events'&&method==='POST'){const e={...row(10+state.events.length,payload.title,payload.starts_at,payload.ends_at,'',0,payload.capacity),...payload,status:payload.publish?'published':'draft',phase:payload.publish?'upcoming':'draft',place:state.options.places.find(p=>p.id===payload.place_id)||null};state.events.push(e);body={event:e};status=201}
    else if(/^events\/\d+/.test(path)){
      const [,id,action,memberId]=path.split('/'),e=state.events.find(e=>e.id===Number(id));
      if(!e)fail(404);else if(!action){if(method==='PUT'){Object.assign(e,payload);e.place=state.options.places.find(p=>p.id===payload.place_id)||null;body={event:e}}else if(method==='DELETE'){state.events=state.events.filter(v=>v.id!==e.id);body={deleted:true}}else body={event:e,can_change:!state.limited,options:state.options}}
      else if(action==='people'){
        let list=state.empty?[]:state.people;if(q.get('q'))list=list.filter(p=>(p.member.name+' '+p.member.member_number).toLowerCase().includes(q.get('q').toLowerCase()));const filter=q.get('attendance');if(filter==='not_checked_in')list=list.filter(p=>!p.checked_in_at&&!p.cancelled_at);if(filter==='checked_in')list=list.filter(p=>p.checked_in_at);if(filter==='walk_in')list=list.filter(p=>p.walk_in);if(filter==='cancelled')list=list.filter(p=>p.cancelled_at);const pages=Math.max(1,Math.ceil(list.length/5)),pageNum=Math.min(Number(q.get('page'))||1,pages);body={event:e,counts:e.counts,people:list.slice((pageNum-1)*5,pageNum*5),page:pageNum,pages,total:list.length,latest:[]};
      }else if(action==='publish'){e.status='published';e.phase='upcoming';body={event:e}}
      else if(action==='cancel'){e.status='cancelled';e.phase='cancelled';body={event:e}}
      else if(action==='check-in'){const p=state.people.find(p=>p.member.id===payload.member_id),already=p.checked_in_at;if(!already){p.checked_in_at='18:15';p.points_awarded=e.points;e.counts.checked_in++;e.counts.not_checked_in--;}body={verdict:{granted:true,reason:'welcome',tier:p.member.tier,allowed_tiers:[],valid_until:null,expires_in_days:null},checked_in:!already,already_in:already,signed_up:!!p.signed_up_at,points:already?0:e.points,attendance_id:p.member.id,scan_event_id:1}}
      else if(action==='sign-ups'){const p=state.people.find(p=>p.member.id===Number(memberId||payload.member_id));if(p){if(method==='DELETE'){p.cancelled_at='2026-11-08T18:15:00Z';e.counts.signed_up--;e.counts.not_checked_in--}else p.signed_up_at='2026-11-08T18:15:00Z'}body={event:e,person:p}}
    }else if(path==='members')body={members:state.people.map(p=>({...p.member,points:100,balance:100,is_active:true})),page:1,pages:1,total:state.people.length};
    else if(path==='start')body={done:7,total:7,steps:[]};
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.setViewportSize({width:1440,height:1080});
  await page.goto(base+'/loyalty/events');await page.locator('.l-ev-detail').waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'render-overview.png',fullPage:true});
  await page.goto(base+'/loyalty/events/new');await page.getByLabel('Event name',{exact:true}).fill('Winter members’ evening');await page.getByLabel('Member description',{exact:true}).fill('Meet other members over coffee and conversation.');await page.getByLabel('Starts',{exact:true}).fill('2026-11-26T18:00');await page.getByLabel('Ends',{exact:true}).fill('2026-11-26T20:00');await page.getByLabel(/^Location/).selectOption('place:1');await page.getByLabel(/^Member signup/).selectOption('true');await page.getByLabel('Capacity · people',{exact:true}).fill('40');await page.getByLabel('Event points',{exact:true}).fill('100');await page.screenshot({path:root+'render-editor.png',fullPage:true});
  await page.goto(base+'/loyalty/events/1');await page.locator('.l-ev-attendee-detail').waitFor();await page.screenshot({path:root+'render-attendees.png',fullPage:true});
  return {errors:state.errors,screens:3,reads:[...new Set(state.requests.filter(r=>r.method==='GET').map(r=>r.path))]};
}
