async (page) => {
  const ctx = page.context();
  await ctx.addInitScript(() => {
    const query = new URL(location.href).searchParams;
    if (query.get('out') === '1') { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); }
    else {
      localStorage.setItem('auth_token', 'fixture-member-session');
      localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Alex Morgan', email: 'alex@example.test', user_type: 'member' }));
    }
    localStorage.setItem('hexatech_loyalty_prefs', JSON.stringify({ language: query.get('lang') || 'en', alerts: false, lock: false }));
  });
  const boot = {
    venue: { name: 'Aurora Members Club', logo_url: null, industry: 'other', currency: 'EUR', timezone: 'Europe/Riga', contact: { email:'team@example.test', phone:null }, accent:{ dark_hex:'#8fb3ff', dark_ink:'#0b1220', dark_deep:'#4a6fd0' }, display_face:'playfair' },
    capabilities: { loyalty:true, services:true, stays:true, events:true, wallets:{apple:false,google:false}, chat:false, payments:{ services:false, stays:false, publishable_key:null } },
    policies:{ services_cancel_hours:24, booking_cancel_hours:48 },
    member: { member_number:'DEMO-000001', name:'Alex Morgan', tier:{ id:1,name:'Gold',color_hex:'#c9a84c' }, current_points:800,lifetime_points:1500,referral_code:'ALEX', progress:{percentage:40,points_needed:700,next_tier:{id:2,name:'Platinum'},by:'points'},recent_activity:[],benefits:[{id:1,name:'Members lounge',display:'Included with your membership'}],membership_mode:'earned',membership:{valid_from:'2026-01-01',valid_until:'2027-01-01',state:'active'},member_since:'2026-01-01', user:{id:1,name:'Alex Morgan',email:'alex@example.test',phone:'',language:'en',date_of_birth:'1990-06-15'},marketing_consent:false,email_notifications:true,push_notifications:false },
    counts:{ unread_notifications:1,upcoming_bookings:1 }
  };
  const offer = { id:12,title:'Your personal member voucher',description:'A private thank-you for your next visit.',type:'discount',value:20,terms_conditions:'One per member. Show at the desk.',end_date:'2027-01-01',attachment:{name:'member-voucher.pdf',mime:'application/pdf',bytes:42} };
  const event = {id:5,title:'Members evening',description:'Reserve your place at our members evening.',starts_at:'2026-12-01T18:30',ends_at:'2026-12-01T20:30',where:'Members lounge',points:20,sign_up:true,walk_ins:false,capacity:10,room_left:5,my:'none',checked_in:false,can_sign_up:true,why_not:null,can_cancel:false};
  const reward = {id:3,name:'Coffee for two',description:'Enjoy two coffees at the desk.',points_cost:100,can_afford:true,claimed_by_me:0,remaining_for_me:2,in_stock:true};
  const log = [];
  const state = { boot, event, log, offer, redemptionCount:0, profileDelay:0, eventDelay:0, redeemDelay:350, stamps:{enabled:false}, credit:{enabled:false,balance:0,currency:'EUR',lines:[]}, history:[], redemptions:[], notificationRead:false };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && url.pathname === '/__fixture') {
      const patch = route.request().postDataJSON() || {};
      if (patch.capabilities) Object.assign(boot.capabilities,patch.capabilities);
      if (patch.member) Object.assign(boot.member,patch.member);
      if (patch.user) Object.assign(boot.member.user,patch.user);
      if (patch.venue) Object.assign(boot.venue,patch.venue);
      if (patch.event) Object.assign(event,patch.event);
      if (patch.clearLog) log.length=0;
      if (patch.profileDelay !== undefined) state.profileDelay=patch.profileDelay;
      if (patch.eventDelay !== undefined) state.eventDelay=patch.eventDelay;
      if (patch.redeemDelay !== undefined) state.redeemDelay=patch.redeemDelay;
      if (patch.stamps) state.stamps=patch.stamps;
      if (patch.credit) state.credit=patch.credit;
      if (patch.history) state.history=patch.history;
      return route.fulfill({json:{log,redemptionCount:state.redemptionCount}});
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname !== 'app.hexa-tech.uk' || !url.pathname.startsWith('/api/')) return route.abort();
    const p = url.pathname.slice(4), method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'*'}});
    log.push({path:p,method,body:route.request().postDataJSON()});
    const reply = body => route.fulfill({json:body,headers:{'access-control-allow-origin':'*'}});
    if (p === '/v1/apps/member/version') return reply({min_version:'2.0.0',latest_version:'2.1.0'});
    if (p === '/v1/auth/me') return reply({user:boot.member.user});
    if (p === '/v1/member/portal') return reply(boot);
    if (p === '/v1/member/portal/programme') return reply({earning:boot.capabilities.loyalty ? {bookings:false,desk:true,base_rate:2,checkin:true,checkin_points:20,expiry_months:12,birthday_points:100,referrals:true} : null,places:[{id:1,name:'Members lounge',description:'Relax in our members lounge.',granted:boot.member.membership.state==='active',reason:'allowed',allowed_tiers:[]},{id:2,name:'Private studio',description:null,granted:false,reason:'tier_not_allowed',allowed_tiers:['Platinum']}]});
    if (p === '/v1/member/card') return reply({member_number:'DEMO-000001',qr_svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="black" d="M5 5h25v25H5zM70 5h25v25H70zM5 70h25v25H5zM40 40h20v20H40zM70 70h20v20H70z"/></svg>'});
    if (p === '/v1/member/benefits') return reply({tier:'Gold',benefits:[{tier_benefit_id:1,benefit_id:1,name:'Members lounge',description:'Your assigned membership benefit.',display:'Included',requestable:true,request:null}]});
    if (p === '/v1/member/benefits/1/request') return route.fulfill({status:422,json:{error:'membership_not_started',message:'Your membership has not started.'},headers:{'access-control-allow-origin':'*'}});
    if (p === '/v1/member/rewards') return reply({rewards:[reward],current_points:boot.member.current_points});
    if (p === '/v1/member/offers') return reply({general:[offer],personalized:[]});
    if (p === '/v1/member/portal/offers/12/attachment') return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nOriginal private demo voucher\n%%EOF'),headers:{'access-control-allow-origin':'*'}});
    if (p === '/v1/member/rewards/3/redeem') {state.redemptionCount++; await new Promise(r=>setTimeout(r,state.redeemDelay));boot.member.current_points-=100;const redemption={id:state.redemptionCount,code:'DEMO-REWARD-'+state.redemptionCount,status:'pending',reward:{name:reward.name},points_spent:100,created_at:'2026-11-11T10:00:00Z'};state.redemptions.push(redemption);return reply({redemption,message:'Ready'});}
    if (p === '/v1/member/my/redemptions') return reply({redemptions:state.redemptions});
    if (p === '/v1/member/portal/stamps') return reply(state.stamps);
    if (p === '/v1/member/portal/credit') return reply(state.credit);
    if (p === '/v1/member/portal/events') return reply({upcoming:boot.capabilities.events ? [event] : [],attended:[{id:2,title:'Summer reception',starts_at:'2026-08-01T18:30',points:10}]});
    if (p === '/v1/member/portal/events/5/sign-up') {if(state.eventDelay)await new Promise(r=>setTimeout(r,state.eventDelay));event.my=method==='DELETE'?'none':'signed_up';event.can_sign_up=method==='DELETE';event.can_cancel=method!=='DELETE';return reply({event});}
    if (p === '/v1/member/notifications') return reply({data:[{id:4,type:'new_offer',title:'Your private voucher',body:'A voucher has arrived for your next visit.',data:{offer_id:12,attachment:offer.attachment},read_at:state.notificationRead?'2026-11-11T10:01:00Z':null,created_at:'2026-11-11T10:00:00Z'}],current_page:1,last_page:1,total:1});
    if (p.includes('/notifications/')) {state.notificationRead=true;boot.counts.unread_notifications=0;return reply({ok:true});}
    if (p === '/v1/auth/push-token' || p === '/v1/auth/logout' || p === '/v1/member/password' || p === '/v1/member/account') return reply({ok:true});
    if (p === '/v1/member/profile') {
      const user={...boot.member.user,...route.request().postDataJSON()};
      if(state.profileDelay) await new Promise(r=>setTimeout(r,state.profileDelay));
      if(boot.member.user.id===user.id) {
        Object.assign(boot.member.user,user);
        for(const key of ['marketing_consent','email_notifications','push_notifications','sms_consent']) if(Object.hasOwn(user,key))boot.member[key]=user[key];
        if(user.notification_preferences)boot.member.notification_preferences={...boot.member.notification_preferences,...user.notification_preferences};
      }
      return reply({user});
    }
    if (p === '/v1/member/referral') return reply({enabled:true,reward_on:'first_visit',referral_link:null,total_referrals:0,rewarded_referrals:0});
    if (p === '/v1/member/points/history') return reply({data:state.history,current_page:1,last_page:1,total:state.history.length});
    return route.fulfill({status:404,json:{message:'Fixture endpoint not defined'},headers:{'access-control-allow-origin':'*'}});
  });
  await page.setViewportSize({width:393,height:852});
  await page.goto('http://127.0.0.1:5837/');
  await page.getByText('Aurora Members Club',{exact:true}).first().waitFor();
  return {title:await page.title(),text:(await page.locator('body').innerText()).slice(0,2500)};
}
