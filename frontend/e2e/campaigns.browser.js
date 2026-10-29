async page => {
  const base='http://127.0.0.1:5173', root='C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/campaigns/';
  const can={award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const boot={name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-28',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,tiers:[]},counts:{members:1248,requests_waiting:4}};
  const segments=[{id:3,name:'Gold · 500+ points',description:null,everyone:false,operator:'AND',filters:[{type:'tier',op:'in',value:[2]},{type:'current_points',op:'min',value:500}],members:480,problem:null,last_sent_at:null,updated_at:'2026-10-28T10:00:00Z'},{id:4,name:'Active members',description:null,everyone:false,operator:'OR',filters:[{type:'activity',op:'active_within',value:30},{type:'earn',op:'any'}],members:812,problem:null,last_sent_at:'2026-10-21T10:00:00Z',updated_at:null},{id:5,name:'New this month',description:null,everyone:false,operator:'AND',filters:[{type:'joined',op:'after',value:'2026-10-01'}],members:84,problem:null,last_sent_at:null,updated_at:null}];
  const segmentOptions={operators:['AND','OR'],max_rules:20,types:[{type:'tier',ops:['in','not_in'],value:'tiers',max:50},{type:'activity',ops:['active_within','inactive_over'],value:'days',min:1,max:3650},{type:'current_points',ops:['min','max'],value:'points',min:0,max:10000000},{type:'earn',ops:['any','none'],value:'none'},{type:'joined',ops:['after','before'],value:'date',min:'1900-01-01',max:'2100-12-31'}],tiers:[{id:1,name:'Silver',color:null,is_active:true},{id:2,name:'Gold',color:null,is_active:true}]};
  const blocks=[{id:'text1',type:'text',text:'Hi {{first_name}},\nYour next reward is waiting. Explore the rewards available for your points.',color:'#555555',align:'left',fontSize:15},{id:'button1',type:'button',text:'Explore rewards',url:'https://example.test/rewards',bgColor:'#4b4ced',textColor:'#ffffff',align:'left'}];
  const options={sender_name:'Hexa Rewards',test_recipient:'alex@example.test',block_types:['heading','text','button','divider','spacer'],new_blocks:{heading:{type:'heading',text:'',level:1,align:'left',color:'#1a1a1a'},text:{type:'text',text:'',color:'#555555',align:'left',fontSize:15},button:{type:'button',text:'',url:'',bgColor:'#4b4ced',textColor:'#ffffff',align:'left'},divider:{type:'divider',color:'#e5e5e5'},spacer:{type:'spacer',height:24}},aligns:['left','center','right'],levels:[1,2,3],font_sizes:[12,13,14,15,16,18],max_blocks:100,max_text:{heading:500,text:5000,button:200},max_url:2000,spacer:{min:4,max:160},max_name:120,max_subject:200,tags:[{tag:'{{first_name}}',name:'first_name',label:'First name'},{tag:'{{member_name}}',name:'member_name',label:'Member name'}],known_tags:['{{first_name}}','{{member_name}}']};
  const html='<div style="font-family:Arial,sans-serif;max-width:600px;background:#fff;color:#1a1a1a;padding:24px"><p>Hi Alex,</p><h1>Your next reward is waiting.</h1><p>Explore the rewards available for your points.</p><a href="https://example.test/rewards">Explore rewards</a></div>';
  const email=(id,name,status='draft')=>({id,name,subject:name,status,segment:segments[0],segment_id:3,recipient_count:status==='draft'?0:728,sent_count:status==='draft'?0:728,failed_count:0,scheduled_at:null,scheduled_for:null,sent_at:status==='draft'?null:'2026-10-21T10:00:00Z',created_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-28T10:00:00Z',editable_here:true,body_blocks:structuredClone(blocks),body_html:html,preview_subject:name,preview_html:html,unknown_tags:[],missing:[],schedule_problem:null,last_progress_at:null,created_by:'Alex Morgan',sent_by:null,revision:'2026-10-28T10:00:00Z'});
  const emails=[email(7,'Your next reward is waiting'),email(8,'A thank you for our members','sent'),{...email(9,'Weekend reward reminder'),segment:null,segment_id:null},email(10,'October member update','sent')];
  const pushOptions={categories:['offers','points','tier','stays'],max_name:120,max_title:200,title_guide:60,max_body:2000,body_guide:160,limit:5000};
  const push={id:2,name:'Reward reminder',title:'Your next reward is waiting',body:'Use your points for a reward you’ll love.',category:'offers',status:'draft',segment:segments[0],segment_id:3,recipient_count:0,results:{sent:0,failed:0,inbox_only:0,skipped:0,pending:0},scheduled_at:null,scheduled_for:null,sent_at:null,created_at:'2026-10-28T10:00:00Z',updated_at:'2026-10-28T10:00:00Z',missing:[],schedule_problem:null,last_progress_at:null,created_by:'Alex Morgan',sent_by:null,revision:'2026-10-28T10:00:00Z'};
  const twilio={ready:false,missing:['account_sid','auth_token','phone_number'],wrong:[],from:null};
  const smsOptions={tags:options.tags,known_tags:options.known_tags,sample:{'{{first_name}}':'Alex','{{member_name}}':'Alex Morgan'},max_name:120,max_body:1600,limit:5000,gsm:{single:160,part:153},ucs2:{single:70,part:67},twilio};
  const sms={id:2,name:'Reward reminder',body:'Hexa: Your next reward is waiting. View rewards: https://example.test/r. Reply STOP to opt out.',excerpt:'Hexa: Your next reward is waiting.',status:'draft',segment:segments[0],segment_id:3,recipient_count:0,results:{sent:0,failed:0,skipped:0,pending:0},segments_sent:0,scheduled_at:null,scheduled_for:null,sent_at:null,created_at:'2026-10-28T10:00:00Z',updated_at:'2026-10-28T10:00:00Z',missing:[],length:{encoding:'gsm7',units:95,segments:1,per_segment:160,unicode:[]},preview:'Hexa: Your next reward is waiting.',preview_length:{encoding:'gsm7',units:95,segments:1,per_segment:160,unicode:[]},unknown_tags:[],problem:null,failures:[],last_progress_at:null,created_by:'Alex Morgan',sent_by:null,revision:'2026-10-28T10:00:00Z'};
  const state={boot,segments,emails,push,sms,twilio,requests:[],errors:[],denied:false,listError:false,audienceError:false,holdSave:false,sendChanged:false,reached:412};
  await page.unrouteAll({behavior:'wait'});page.setDefaultTimeout(15000);page.removeAllListeners('pageerror');page.on('pageerror',e=>state.errors.push(e.message));
  await page.context().addInitScript(()=>{if(window.top!==window)return;localStorage.setItem('admin_lang','en');localStorage.setItem('auth_token','campaign-local-fixture');localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'campaign-local-fixture',user:{id:1,name:'Alex Morgan',email:'alex@example.test',user_type:'staff',language:'en'},staff:{role:'manager'}},version:1}));localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));});
  await page.route('**/manifest.webmanifest',r=>r.fulfill({contentType:'application/manifest+json',body:'{"name":"Local fixture"}'}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/admin/loyalty/')[1]||url.pathname,method=req.method();let payload=null;try{payload=req.postDataJSON()}catch{}
    if(path==='__fixture'){if(payload)Object.assign(state,payload);if(payload?.releaseSave)state.release?.();return route.fulfill({contentType:'application/json',body:JSON.stringify(state)});}
    state.requests.push({path,method,query:url.search,payload});let body={},status=200;
    const [family,idRaw,action]=path.split('/'),id=Number(idRaw);
    const response=()=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='bootstrap'){body=state.boot;return response();}
    if(state.denied){status=403;body={message:'Forbidden',code:'forbidden'};return response();}
    if(path==='segments/options'){body=segmentOptions;return response();}
    if(path==='segments/preview'){body={count:480,marketing:432,sample:[]};return response();}
    if(family==='segments'){
      if(method==='GET')body={segments:state.segments};
      else if(method==='DELETE'){state.segments=state.segments.filter(s=>s.id!==id);body={ok:true};}
      else{const segment={...(state.segments.find(s=>s.id===id)||{id:30+state.segments.length,members:480,problem:null,last_sent_at:null,updated_at:null}),...payload};if(method==='POST'){state.segments.push(segment);status=201;}else state.segments=state.segments.map(s=>s.id===id?segment:s);body={segment};}
      return response();
    }
    if(['campaigns','push','sms'].includes(family)){
      let item=family==='campaigns'?state.emails.find(c=>c.id===id):state[family];
      const answer=()=>family==='campaigns'?{campaign:item,options}:family==='push'?{push:item,options:pushOptions}:{sms:item,options:{...smsOptions,twilio:state.twilio}};
      if(!idRaw&&method==='GET'){
        if(state.listError){status=503;body={message:'Temporarily unavailable'};return response();}
        const all=family==='campaigns'?state.emails:[state[family]];const q=(url.searchParams.get('q')||'').toLowerCase(),filter=url.searchParams.get('status');const rows=all.filter(r=>(!q||(r.name+' '+(r.subject||r.title||r.body||'')).toLowerCase().includes(q))&&(!filter||r.status===filter));
        body={page:1,pages:1,total:rows.length,all_total:all.length,...(family==='campaigns'?{campaigns:rows,sender_name:'Hexa Rewards'}:{messages:rows}),...(family==='sms'?{twilio:state.twilio}:{})};
      }else if(!idRaw&&method==='POST'){item=family==='campaigns'?email(40+state.emails.length,payload.name):{...state[family],id:50,name:payload.name};if(family==='campaigns'){item.subject='';item.body_blocks=[];item.body_html='';item.preview_html='';item.segment_id=null;item.segment=null;item.missing=['subject','body'];state.emails.push(item);}else state[family]=item;body=answer();status=201;}
      else if(!item){status=404;body={message:'Not found'};}
      else if(action==='audience'){
        if(state.audienceError){status=503;body={message:'Audience unavailable'};}
        else body={audience:{segment:item.segment||state.segments[0],members:480,reached:state.reached,limit:5000,no_consent:48,unsubscribed:12,suppressed:8,no_email:0,push_off:20,no_device:48,opted_out:0,no_phone:10,bad_phone:10,same_phone:0,segments:412,category:'offers'}};
      }else if(action==='test')body={sent_to:family==='sms'?'+15555550123':'alex@example.test',segments:1};
      else if(action==='send'){if(state.sendChanged){status=409;body={code:'audience_changed',message:'Audience changed',reached:411};state.sendChanged=false;state.reached=411;}else{item.status='sending';item.recipient_count=payload.recipients;body=answer();}}
      else if(action==='schedule'){item.status='scheduled';item.scheduled_for=payload.send_at;body={...answer(),about:412,about_segments:412};}
      else if(action==='unschedule'){item.status='draft';body=answer();}
      else if(action==='cancel'){item.status='cancelled';body=answer();}
      else if(action==='duplicate'){item={...structuredClone(item),id:60,name:payload.name,status:'draft'};if(family==='campaigns')state.emails.push(item);else state[family]=item;body=answer();status=201;}
      else if(method==='PUT'){if(state.holdSave)await new Promise(resolve=>{state.release=resolve});Object.assign(item,payload,{revision:'2026-10-28T11:00:00Z',segment:state.segments.find(s=>s.id===payload.segment_id)||null});if(family==='campaigns'){item.preview_subject=item.subject;item.missing=[...(!item.subject?['subject']:[]),...(!item.body_blocks.length?['body']:[])];item.body_html=html;item.preview_html=html;}body=answer();}
      else if(method==='DELETE'){if(family==='campaigns')state.emails=state.emails.filter(c=>c.id!==id);body={ok:true};}
      else body=answer();return response();
    }
    status=404;body={message:'Unmocked local fixture endpoint'};return response();
  });
  await page.setViewportSize({width:1440,height:1080});await page.goto(base+'/loyalty/campaigns');await page.locator('.l-cm-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'render-email-list.png',fullPage:false});
  return {root,errors:state.errors};
}
