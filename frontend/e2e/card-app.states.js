// Only intercepted local fixtures; no provider delivery or real pass issuance.
async page => {
  const base=new URL(page.url()).origin, root='C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/card-app/', checks=[];
  if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local fixtures required');
  const ok=(v,n)=>{if(!v)throw Error(n);checks.push(n)},button=name=>page.getByRole('button',{name,exact:true});
  const fixture=body=>page.evaluate(async body=>(await fetch('/api/v1/admin/loyalty/__fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json(),body);
  const go=async(q='')=>{await page.goto(base+'/loyalty/app'+q);await page.locator('h1').waitFor()};
  const ready=()=>page.locator('.l-ca-wallets').waitFor();
  const close=async()=>{await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'})};
  const initial=await fixture({});await ready();
  ok(initial.requests.every(r=>r.method==='GET'),'opening only reads settings');
  ok(await page.locator('[data-design] .l-ca-status').allTextContents().then(x=>x.length===2&&x.every(v=>v==='On hold')),'both disconnected designers are on hold');
  ok(await page.locator('.l-ca-page form,.l-ca-page input[type=file]').count()===0,'on-hold designs offer no misleading save or upload');
  ok(!initial.requests.some(r=>r.path==='app-look'),'on-hold designs do not request unused settings');
  await page.getByText('View provider requirements',{exact:true}).click();
  ok((await page.locator('.l-ca-requirements').innerText()).includes('publishing access'),'wallet setup explains provider approval');
  ok((await page.locator('.l-ca-requirements').innerText()).includes('Members then add their own card'),'members do not upload provider credentials');
  await page.locator('[data-provider=apple]').getByRole('button',{name:'Test on device',exact:true}).click();
  ok((await page.locator('dialog[open]').innerText()).includes('does not generate anonymous sample passes'),'device test is guidance rather than fabricated issuance');await close();
  ok(await page.locator('[data-provider=apple]').getByRole('button',{name:'Test on device',exact:true}).evaluate(e=>e===document.activeElement),'test guide restores focus');
  ok(await page.locator('[data-provider=google]').getByRole('button',{name:'Test on device',exact:true}).isDisabled(),'unconfigured provider cannot be tested');
  await page.locator('[data-provider=apple]').getByRole('link',{name:'Connection settings',exact:true}).click();await page.getByLabel('Pass Type ID',{exact:true}).waitFor();
  ok(await page.locator('[data-file]').count()===3,'existing wallet credential controls remain available to managers');
  ok(await page.locator('input[type=password]').count()===0,'saved credentials are never exposed');
  ok(await page.locator('.l-ca-requirements').count()===1,'direct wallet bookmark includes prerequisites');
  await page.getByLabel('Name on the pass',{exact:true}).fill('Fixture wallet name');await page.getByLabel('Wallet passes are on',{exact:true}).uncheck();await button('Save wallet pass').click();await page.getByText('Saved.',{exact:true}).waitFor();
  ok((await fixture({})).wallet.apple_organization_name==='Fixture wallet name','wallet settings retain their existing writer');
  await page.locator('[data-file=google_service_account]').getByRole('button',{name:/^Upload/}).click();await page.getByLabel('File',{exact:true}).setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from('{"fixture":true}')});await page.getByRole('dialog').getByRole('button',{name:'Upload',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  ok((await page.locator('[data-file=google_service_account]').innerText()).includes('Replace'),'wallet upload refreshes scoped settings');
  await go();await ready();ok(await page.getByText('Switched off',{exact:true}).count()===2,'main page reflects saved provider active state');await fixture({wallet:initial.wallet});
  await go('?tab=currency');await button('Save currency').waitFor();ok((await page.locator('.l-ca-settings').innerText()).includes('never converts'),'currency flow remains available');
  await go('?tab=app');await page.locator('[data-design=member]').waitFor();ok(await page.locator('form,[data-colour]').count()===0,'old app bookmark cannot bypass on-hold state');
  await page.locator('#app-tab-wallet').click();await page.getByLabel('Pass Type ID',{exact:true}).waitFor();ok(new URL(page.url()).searchParams.get('tab')==='wallet','legacy tab navigation still opens wallet settings');
  await fixture({failWallet:true});await go();await page.getByText('Wallet connections could not be loaded.',{exact:true}).waitFor();
  ok(await page.locator('[data-design]').count()===2&&await page.locator('[data-provider]').count()===0,'wallet failure never shows stale readiness');
  await fixture({failWallet:false});await button('Try again').click();await ready();ok(true,'wallet retry recovers');
  const restricted=structuredClone(initial.boot);restricted.staff.can.manage_app=false;await fixture({boot:restricted,requests:[]});await go();await page.locator('.l-ov-recovery').waitFor();
  ok(!(await fixture({})).requests.some(r=>['app-look','wallet'].includes(r.path)),'staff without permission request no settings');
  const noWallet=structuredClone(initial.boot);noWallet.features.wallet=false;await fixture({boot:noWallet,requests:[]});await go();await page.getByText('Your plan does not include wallet passes. Design tools are on hold.',{exact:true}).waitFor();
  ok(!(await fixture({})).requests.some(r=>r.path==='wallet'),'plan gating avoids wallet read');
  await fixture({boot:initial.boot,requests:[]});
  for(const width of [1440,1280,1024,768,390,320]){
    await page.setViewportSize({width,height:width<600?844:1080});await go();await ready();await page.evaluate(()=>document.fonts.ready);
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1),'page fits '+width+'px');
    await page.getByText('View provider requirements',{exact:true}).click();ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'expanded requirements fit '+width+'px');
    if([1440,390].includes(width)){await page.locator('h1').click();await page.screenshot({path:root+'render-'+width+'.png',fullPage:true})}
  }
  await page.setViewportSize({width:1440,height:1080});await button('Settings').click();await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Light',exact:true}).click();await close();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-overview]')).backgroundColor==='rgb(244, 246, 249)');await page.screenshot({path:root+'render-light.png',fullPage:false});ok(true,'workspace light theme supported');
  for(const lang of ['ru','de','fr','es']){
    await page.getByRole('button',{name:/^(Settings|Настройки|Einstellungen|Réglages|Configuración)$/}).click();await page.getByRole('combobox',{name:/Language|Язык|Sprache|Langue|Idioma/}).selectOption(lang);await close();
    ok(!(await page.locator('.l-ca-page').innerText()).includes('On hold'),'on-hold state translated '+lang);
    await page.setViewportSize({width:390,height:1080});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'translated mobile fits '+lang);await page.screenshot({path:root+'render-'+lang+'.png',fullPage:true});await page.setViewportSize({width:1440,height:1080});
  }
  const s=await fixture({});ok(s.requests.filter(r=>r.path==='wallet').every(r=>new URLSearchParams(r.query).get('brand_id')==='all'),'wallet calls retain organisation-wide scope');
  ok(!s.requests.some(r=>r.path==='app-look'||r.path==='app-look/logo'),'no appearance writes or reads throughout parked routes');
  ok(s.errors.length===0,'no browser runtime errors');return {passed:checks.length,checks,errors:s.errors};
}
