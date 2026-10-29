// Local API fixtures only. No production requests or member mutations.
async (page) => {
  const base = 'http://127.0.0.1:5173';
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/requests/';
  const can = {award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const tiers = ['Bronze','Silver','Gold'].map((name,i)=>({id:i+1,name,color:null,min_points:i*1000,is_active:true}));
  const boot = {name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-28',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers},counts:{members:1248,requests_waiting:4}};
  const jamie={id:1048,name:'Jamie Taylor',number:'M-1048',tier:'Silver'}, morgan={id:1035,name:'Morgan Lee',number:'M-1035',tier:'Gold'}, casey={id:1040,name:'Casey Jordan',number:'M-1040',tier:'Silver'}, sam={id:1055,name:'Sam Lee',number:'M-1055',tier:'Bronze'};
  const benefit=(id,title,member,state,time)=>({id,key:'benefit:'+id,kind:'benefit',title,member,state,at:'2026-10-28T'+time+':00Z',fulfilled_at:null,decline_reason:null});
  const records=[benefit(1048,'Welcome drink',jamie,'pending','08:42'),{id:2184,key:'redemption:2184',kind:'redemption',title:'Complimentary coffee',member:jamie,state:'pending',at:'2026-10-28T08:30:00Z',code:'REW-COFFEE',points:500,fulfilled_at:null,cancelled_at:null},benefit(1043,'Late checkout',morgan,'approved','07:55'),benefit(1039,'Welcome gift',casey,'eligible','07:18'),{id:312,key:'referral:312',kind:'referral',member:sam,referee:{id:1100,name:'Robin Blake',number:'M-1100',tier:'Bronze'},state:'pending',at:'2026-10-28T06:40:00Z',points:{referrer:0,referee:0},qualified_at:null,rewarded_at:null}];
  const state={boot,records,errors:[],requests:[],fail:'',denied:false,empty:false,limited:false,slow:false,writeFail:false,applyThenFail:false,staleAction:false};
  await page.unrouteAll({behavior:'wait'}); await page.context().setOffline(false); page.setDefaultTimeout(12000);
  page.removeAllListeners('pageerror'); page.on('pageerror',e=>state.errors.push(e.message));
  page.removeAllListeners('dialog'); page.on('dialog',async d=>{try{if(d.type()==='beforeunload')await d.accept();else await d.dismiss()}catch{}});
  await page.context().addInitScript(()=>{localStorage.setItem('admin_lang','en');localStorage.setItem('auth_token','requests-local-fixture');localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'requests-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));});
  await page.route('**/manifest.webmanifest',r=>r.fulfill({contentType:'application/manifest+json',body:'{"name":"Local test"}'}));
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname.split('/admin/loyalty/')[1]||url.pathname,method=request.method(),q=url.searchParams;
    let payload=null; try{payload=request.postDataJSON()}catch{}
    if(path==='__fixture'){if(payload)Object.assign(state,payload);return route.fulfill({contentType:'application/json',body:JSON.stringify(state)});}
    state.requests.push({path,method,payload,query:url.search});
    if(state.slow&&method!=='GET')await new Promise(r=>setTimeout(r,1200));
    let body={},status=200;const fail=code=>{status=code;body={error:code===403?'not_allowed':code===404?'not_found':code===409?'wrong_state':'unavailable'}};
    if(path==='bootstrap'){body=structuredClone(state.boot);if(state.limited)body.staff.can.redeem=false;}
    else if(state.fail===path)fail(503);
    else if(path==='requests/inbox'){
      if(state.denied)fail(403);else{
        const kind=q.get('type')||'all',view=q.get('view')||'open',term=(q.get('q')||'').toLowerCase();
        const isOpen=r=>r.kind==='benefit'?['pending','eligible','approved'].includes(r.state):r.kind==='redemption'?r.state==='pending':['pending','qualified'].includes(r.state);
        let list=state.empty?[]:state.records.filter(r=>(kind==='all'||r.kind===kind)&&(view==='all'||view==='open'&&isOpen(r)||view==='closed'&&!isOpen(r)||view==='waiting'&&r.kind==='benefit'&&['pending','eligible'].includes(r.state)||view==='approved'&&r.kind==='benefit'&&r.state==='approved'));
        if(term)list=list.filter(r=>[r.title,r.member?.name,r.member?.number,r.referee?.name,r.code,r.id,'#'+({benefit:'BR',redemption:'RR',referral:'RF'}[r.kind])+'-'+r.id].join(' ').toLowerCase().includes(term));
        list.sort((a,b)=>q.get('sort')==='oldest'?a.at.localeCompare(b.at):b.at.localeCompare(a.at));
        const pages=Math.max(1,Math.ceil(list.length/5)),pageNum=Math.min(Number(q.get('page'))||1,pages),selected=q.get('selected_kind')?state.records.find(r=>r.kind===q.get('selected_kind')&&r.id===Number(q.get('selected_id'))):null;
        if(q.get('selected_kind')&&!selected)fail(404);else body={records:list.slice((pageNum-1)*5,pageNum*5),selected:selected||null,page:pageNum,pages,total:list.length,per_page:5};
      }
    }else if(/^(requests|redemptions)\/\d+\//.test(path)&&method==='POST'){
      const [area,id,action]=path.split('/'),r=state.records.find(r=>r.kind===(area==='requests'?'benefit':'redemption')&&r.id===Number(id));
      if(!r)fail(404);else if(state.limited&&area==='redemptions')fail(403);else if(state.writeFail)fail(503);else if(state.staleAction){r.state='fulfilled';state.staleAction=false;fail(409);}
      else if(action==='decline'&&(!payload?.reason||payload.reason.trim().length<2)){status=422;body={error:'invalid',errors:{reason:['Required']}};}
      else if(!['pending','eligible','approved'].includes(r.state))fail(409);
      else{r.state=action==='approve'?'approved':action==='decline'?'declined':action==='cancel'?'cancelled':'fulfilled';if(r.state==='fulfilled')r.fulfilled_at='2026-10-28T09:00:00Z';if(r.state==='declined')r.decline_reason=payload.reason;if(r.state==='cancelled')r.cancelled_at='2026-10-28T09:00:00Z';body={[area==='requests'?'request':'redemption']:r};if(state.applyThenFail){state.applyThenFail=false;fail(503);}}
    }else if(path==='start')body={done:7,total:7,steps:[]};
    else if(path==='find')body={members:[]};
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.setViewportSize({width:1440,height:1080});await page.goto(base+'/loyalty/requests');await page.locator('.l-rq-detail').waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'render-benefit.png',fullPage:false});
  await page.locator('.l-rq-row').filter({hasText:'Complimentary coffee'}).click();await page.locator('.l-rq-detail h2').filter({hasText:'Complimentary coffee'}).waitFor();await page.screenshot({path:root+'render-reward.png',fullPage:false});
  await page.locator('.l-rq-row').filter({hasText:'Referral bonus'}).click();await page.locator('dialog[open]').waitFor();await page.locator('dialog[open]').screenshot({path:root+'render-referral.png'});await page.getByRole('button',{name:'Close',exact:true}).last().click();
  return {screens:3,errors:state.errors,reads:[...new Set(state.requests.filter(r=>r.method==='GET').map(r=>r.path))]};
}
