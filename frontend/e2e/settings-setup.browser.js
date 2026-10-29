// Local intercepted fixtures only. Run with the real Ways-to-earn contract fixture.
async (page, answer) => {
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/settings-setup/';
  const base = 'http://127.0.0.1:5173';
  const checks = [], errors = [], requests = [];
  const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
  const can = {award:true,redeem:true,reverse:true,manage_program:true,manage_rewards:true,manage_members:true,view_insights:true,manage_campaigns:true,manage_app:true};
  const boot = {name:'HexaTech Loyalty',organization:{id:1,name:'Northstar Club',industry:'hotel'},accent:null,venue:{timezone:'Europe/Riga',timezone_named:true,today:'2026-10-29',currency:'EUR'},features:{campaigns:true,wallet:true,push:true},staff:{id:1,name:'Alex Morgan',role:'manager',can},programme:{on:true,progress_by:'points',tiers:[],ways:{setup_done:true,stamps_enabled:true,checkin_enabled:true,desk_earn_enabled:false,cashback_enabled:false}},counts:{members:1248,requests_waiting:1}};
  const state = {currency:'EUR',currencyError:0,previewError:0,writeError:0,limited:false,setupError:0,delay:0};
  await page.unrouteAll({behavior:'wait'});
  page.on('pageerror', e => errors.push(e.message));
  await page.context().addInitScript(() => {
    if (!localStorage.getItem('admin_lang')) localStorage.setItem('admin_lang','en');
    localStorage.setItem('auth_token','settings-local-fixture');
    localStorage.setItem('loyalty-auth',JSON.stringify({state:{token:'settings-local-fixture',user:{id:1,name:'Alex Morgan',email:'fixture@example.test',user_type:'staff',language:localStorage.getItem('admin_lang') || 'en'},staff:{role:'manager'}},version:1}));
    if (!localStorage.getItem('loyalty:look')) localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}));
  });
  await page.route('**/manifest.webmanifest',route=>route.fulfill({contentType:'application/manifest+json',body:'{"name":"Local test"}'}));
  await page.route('**/api/**', async route => {
    const req=route.request(), url=new URL(req.url()), path=url.pathname.split('/admin/loyalty/')[1] || url.pathname, method=req.method();
    let payload=null; try { payload=req.postDataJSON(); } catch {}
    requests.push({path,method,payload,query:url.search});
    if(state.delay && method!=='GET') await new Promise(r=>setTimeout(r,state.delay));
    let body={},status=200;
    if(path==='bootstrap') { body=structuredClone(boot); body.venue.currency=state.currency; if(state.limited) Object.keys(body.staff.can).forEach(k=>body.staff.can[k]=false); }
    else if(path==='currency') {
      status=method==='GET' ? state.currencyError : payload?.dry_run ? state.previewError : state.writeError;
      if(!status && method==='PUT' && !payload?.dry_run) state.currency=payload.currency;
      body=status ? {error:status===403?'forbidden':'unavailable'} : payload?.dry_run ? {dry_run:true,from:state.currency,to:payload.currency,relabel:{services:12,extras:3},payments:{mismatch:true,currency:'EUR'},bookings:{total:8,upcoming:2},stays:{currency:'EUR'}} : {currency:state.currency,options:['EUR','GBP','USD']};
      status ||= 200;
    } else if(path==='options') { body=structuredClone(answer);body.can_change=!state.limited; }
    else if(path==='options/setup') {
      status=state.setupError || 200;
      body=state.setupError?{error:'unavailable'}:{...answer,setup:{preset_applied:false,summary:{tiers_added:0,rewards_added:0}}};
    } else if(path==='options/setup/skip') body=answer;
    else if(path==='start') body={done:2,total:7,steps:['programme','tiers','ways','rewards','logo','member','scan'].map((key,i)=>({key,done:i<2,count:i<2?3:0}))};
    else if(path==='members/imports') body={imports:[],columns:['name','email','phone','points','joined_at']};
    else if(path==='members/duplicates') body={pairs:[]};
    else if(path.endsWith('/auth/subscription')) body={subscription:null};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const open = async path => { await page.goto(base+path); await page.locator('main').waitFor(); await page.evaluate(()=>document.fonts.ready); };
  const settings = async () => { await open('/loyalty/settings'); await page.locator('.l-st-field select').last().locator('option').last().waitFor({state:'attached'}); };
  const save = () => page.locator('.l-st-save').getByRole('button',{name:'Save preferences',exact:true});
  const discard = () => page.locator('.l-st-save').getByRole('button',{name:'Discard changes',exact:true});
  const currency = () => page.locator('.l-st-field select').last();
  const screen = async name => { await page.screenshot({path:root+'render-'+name+'.png',fullPage:true,animations:'disabled'}); };
  const fit = async name => check(name,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize({width:1440,height:1080});
  await settings(); await currency().selectOption('GBP'); await save().waitFor({state:'visible'}); await page.waitForFunction(()=>!document.querySelector('.l-st-save button:last-child').disabled); await screen('settings-desktop');
  await save().click(); await page.locator('.l-st-confirm').waitFor(); await screen('currency-review');
  check('currency review has separated warning sections',await page.locator('.l-st-confirm .l-ov-dialog-body').evaluate(el=>getComputedStyle(el).display==='flex'&&getComputedStyle(el).gap==='16px'));
  await page.setViewportSize({width:320,height:680});await fit('currency review fits 320');await screen('currency-review-mobile');
  check('currency review height stays inside phone viewport',await page.locator('.l-st-confirm').evaluate(el=>el.getBoundingClientRect().height<=innerHeight-20));
  await page.keyboard.press('Tab');check('currency modal keeps keyboard focus',await page.evaluate(()=>document.querySelector('.l-st-confirm').contains(document.activeElement)));
  await page.setViewportSize({width:1440,height:1080});
  check('currency preview before save',requests.filter(r=>r.path==='currency'&&r.method==='PUT').every(r=>r.payload.dry_run===true));
  check('server impact warnings retained',(await page.locator('.l-st-warnings li').count())>=3);
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  check('cancel leaves currency unchanged',state.currency==='EUR');
  await discard().click();
  await page.getByRole('button',{name:'Light',exact:true}).click();
  check('theme staged before save',await page.locator('[data-loyalty]').getAttribute('data-theme')==='dark');
  await save().click(); await page.locator('[data-loyalty][data-theme="light"]').waitFor();
  check('theme applied to live frame',true); await screen('settings-light');
  await page.reload(); await page.locator('[data-loyalty][data-theme="light"]').waitFor();
  check('theme persisted across reload',true);
  await page.getByRole('button',{name:'Dark',exact:true}).click(); await discard().click();
  check('discard restores saved theme',await page.getByRole('button',{name:'Light',exact:true}).getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'Dark',exact:true}).click(); await save().click();
  await page.locator('[data-loyalty][data-theme="dark"]').waitFor();
  await page.getByRole('button',{name:'Auto',exact:true}).click(); await save().click();
  await page.emulateMedia({colorScheme:'light'}); await page.locator('[data-loyalty][data-theme="light"]').waitFor();
  await page.emulateMedia({colorScheme:'dark'}); await page.locator('[data-loyalty][data-theme="dark"]').waitFor(); check('Auto follows system theme',true);
  await currency().selectOption('USD'); await page.locator('.l-st-related a[href="/loyalty/program"]').click();
  await page.getByRole('dialog',{name:'Unsaved preference changes'}).waitFor();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click(); check('leave guard preserves draft',await currency().inputValue()==='USD'); await discard().click();
  state.previewError=503; await currency().selectOption('GBP'); await save().click(); await page.locator('.l-st-panel [role="alert"]').waitFor(); check('preview failure is visible',true);
  state.previewError=0; await save().click(); await page.locator('.l-st-confirm').waitFor();
  state.writeError=503; await page.locator('.l-st-confirm').getByRole('button',{name:'Save preferences',exact:true}).click(); await page.locator('.l-st-confirm [role="alert"]').waitFor();
  check('write failure preserves currency',state.currency==='EUR');
  state.writeError=0; state.delay=500; await page.locator('.l-st-confirm').getByRole('button',{name:'Save preferences',exact:true}).click();
  check('save locked while writing',await page.locator('.l-st-confirm').getByRole('button',{name:'Save preferences',exact:true}).isDisabled());
  await page.locator('.l-st-confirm').waitFor({state:'hidden'});state.delay=0; check('confirmed currency saved',state.currency==='GBP');
  check('successful currency save refreshed bootstrap',requests.filter(r=>r.path==='bootstrap').length>=3);
  for(const locale of ['ru','de','fr','es','en']) {
    await page.locator('.l-st-field select').first().selectOption(locale); await page.locator('.l-st-save button').last().click();
    await page.waitForFunction(code=>localStorage.getItem('admin_lang')===code,locale);
    check(locale+' locale has no raw keys',!(await page.locator('main').innerText()).includes('loyalty.settingsdesign.'));
    await page.setViewportSize({width:320,height:900});await fit(locale+' Settings fits 320');await page.setViewportSize({width:1440,height:1080});
  }
  await page.reload(); await page.locator('.l-st-page').waitFor();
  await page.locator('[data-frame-footer]').getByRole('button',{name:'Settings',exact:true}).click();
  check('quick preferences still available',await page.locator('.l-quick-settings').isVisible());
  await page.locator('.l-quick-settings').getByRole('link',{name:'All settings'}).click();
  for(const width of [1280,1024,768,390,320]) {await page.setViewportSize({width,height:900});await fit('Settings fits '+width);if([390,320].includes(width))await screen('settings-'+width);}
  await page.setViewportSize({width:1440,height:1080});
  state.currencyError=503; await settings(); await page.getByRole('button',{name:'Try again',exact:true}).waitFor();check('currency load failure recoverable',true);
  state.currencyError=0; await page.getByRole('button',{name:'Try again',exact:true}).click(); await page.waitForFunction(()=>document.querySelector('.l-st-field:last-of-type select')?.disabled===false).catch(()=>{});
  state.limited=true; const priorGets=requests.filter(r=>r.path==='currency'&&r.method==='GET').length; await open('/loyalty/settings'); await page.locator('.l-st-page').waitFor();
  check('regular staff cannot edit venue currency',await currency().isDisabled());check('regular staff do not request manager currency',requests.filter(r=>r.path==='currency'&&r.method==='GET').length===priorGets);
  state.limited=false;answer.catalogue.tiers=3; await open('/loyalty/options/setup');await page.locator('.l-gs-form').waitFor();await screen('setup-desktop');
  check('existing tiers preserved',await page.locator('[data-choice="keep"] input').isChecked());
  check('unused presets collapsed',!(await page.locator('.l-gs-presets').getAttribute('open')));
  await page.getByRole('button',{name:'Next',exact:true}).click(); await page.locator('[data-step="choose"][aria-current]').waitFor(); await screen('setup-choose');
  await page.getByRole('button',{name:'Next',exact:true}).click(); await page.locator('[data-step="configure"][aria-current]').waitFor();
  const rate=page.locator('[data-configure="earn_rate"] input');await rate.fill('-1');await page.getByRole('button',{name:'Next',exact:true}).click();
  check('invalid setup values stay on Configure',await page.locator('[data-step="configure"][aria-current]').count()===1);
  await rate.fill('17');await screen('setup-configure');
  check('member preview uses actual draft', (await page.locator('.l-gs-preview').innerText()).includes('17'));
  await page.locator('.l-gs-optional a').first().click();await page.getByRole('dialog',{name:'Discard your changes?'}).waitFor();await page.getByRole('button',{name:'Keep editing',exact:true}).click();check('setup leave guard retains draft',await rate.inputValue()==='17');
  for(const width of [1280,1024,768,390,320]) {await page.setViewportSize({width,height:900});await fit('Guided setup fits '+width);if(width===390)await screen('setup-mobile');}
  await page.setViewportSize({width:1440,height:1080});await page.getByRole('button',{name:'Next',exact:true}).click();await page.locator('[data-step="review"][aria-current]').waitFor();await screen('setup-review');
  state.setupError=503;await page.getByRole('button',{name:'Apply',exact:true}).click();await page.locator('.l-gs-form [role="alert"]').waitFor();
  state.setupError=0;await page.getByRole('button',{name:'Apply',exact:true}).click();await page.locator('[data-setup-done]').waitFor();
  const writes=requests.filter(r=>r.path==='options/setup');check('Apply retries retain idempotency key',writes.length===2&&writes[0].payload.idempotency_key===writes[1].payload.idempotency_key);
  check('Apply sends edited points',writes[1].payload.options.points_per_currency===17);
  await open('/loyalty/options/setup');await page.locator('.l-gs-form').waitFor();await page.getByRole('button',{name:'Skip setup',exact:true}).click();await page.getByRole('dialog').waitFor();await screen('setup-skip');await page.getByRole('button',{name:'Keep going',exact:true}).click();
  check('skip cancel writes nothing',requests.filter(r=>r.path==='options/setup/skip').length===0);
  answer.catalogue.tiers=0;await open('/loyalty/options/setup');await page.locator('.l-gs-form').waitFor();await screen('setup-new-programme');check('new programme presets available',await page.locator('[data-choice] input:not(:disabled)').count()>0);
  state.limited=true;await open('/loyalty/options/setup');await page.getByText('Only an owner or a manager can set up the programme.').waitFor();check('staff permission preserved for setup',await page.locator('.l-gs-form').count()===0);
  state.limited=false;
  for(const [name,path] of [['start','/loyalty/start'],['guide','/loyalty/guide'],['import','/loyalty/members/import'],['duplicates','/loyalty/members/duplicates']]) {
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1080});await open(path);await page.waitForLoadState('networkidle');await fit(name+' fits '+width);check(name+' shared frame '+width,await page.locator('.l-overview-frame .l-utility-content h1').count()===1);
      if(width!==320)await screen(name+'-'+width);
    }
  }
  check('no browser errors',errors.length===0);
  check('all loyalty API calls use all-brand scope',requests.filter(r=>!r.path.startsWith('/')).every(r=>r.query.includes('brand_id=all')));
  return {checks,errors,requests:requests.filter(r=>!r.path.includes('auth'))};
}
