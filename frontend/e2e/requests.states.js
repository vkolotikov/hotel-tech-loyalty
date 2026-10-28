// Run after a fresh requests.browser.js fixture.
async (page) => {
  const base=new URL(page.url()).origin;if(!/^http:\/\/(127\.0\.0\.1|localhost):(5173|5810)$/.test(base))throw Error('Local fixture required');
  const root='C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/requests/',checks=[];
  const ok=(v,name)=>{if(!v)throw Error(name);checks.push(name)};
  const fixture=body=>page.evaluate(async body=>await(await fetch('/api/v1/admin/loyalty/__fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json(),body);
  const go=async(q='')=>{await page.goto(base+'/loyalty/requests'+q);await page.locator('.l-rq-page').waitFor()};
  const ready=async()=>{await page.locator('.l-rq-detail').waitFor();await page.waitForFunction(()=>!document.querySelector('.l-rq-page > header button').disabled)};
  const button=name=>page.getByRole('button',{name,exact:true});
  await fixture({limited:true});await go('?record=redemption:2184');await ready();ok(await button('Mark done').count()===0,'restricted redemption hides fulfilment');ok((await page.locator('.l-rq-detail').innerText()).includes('Only staff allowed to redeem points'),'restricted redemption explains permission');await go('?record=benefit:1048');await ready();ok(await button('Approve request').count()===1,'ordinary staff can still approve benefits');
  await fixture({limited:false,empty:true});await go();await page.getByText('No requests match this view.',{exact:true}).waitFor();ok(await page.locator('.l-rq-detail').count()===0,'empty queue has no invented selected record');
  await fixture({empty:false,fail:'requests/inbox'});await go();await page.locator('.l-ov-recovery').waitFor();ok(await page.locator('.l-rq-row').count()===0,'failed initial read does not show a false empty queue');await fixture({fail:''});await button('Try again').click();await ready();ok(true,'initial error retries successfully');
  await fixture({fail:'requests/inbox'});await button('Refresh').click();await page.getByText('The last refresh failed. These details may have changed. Refresh before taking action.',{exact:true}).waitFor();ok(await button('Approve request').isDisabled(),'cached stale record cannot be actioned');await fixture({fail:''});await button('Try again').click();await page.waitForFunction(()=>[...document.querySelectorAll('.l-rq-detail button')].some(e=>e.textContent==='Approve request'&&!e.disabled));ok(await button('Approve request').isEnabled(),'refresh restores actions');
  await go('?record=benefit:999999');await page.locator('.l-ov-recovery').waitFor();await button('View all requests').click();await ready();ok(true,'missing selected record can recover to list');
  await fixture({denied:true});await button('Refresh').click();await page.locator('.l-ov-recovery').waitFor();await page.waitForFunction(()=>!document.querySelector('.l-rq-detail')&&!document.querySelector('.l-rq-row'));ok(true,'authorization loss removes cached member records');await fixture({denied:false});await go();await ready();
  let data=await fixture({});const extra={...data.records[0],id:1,key:'benefit:1',title:'Older benefit',at:'2026-10-27T08:00:00Z'};await fixture({records:[...data.records,extra]});await go();await ready();await button('Next').click();await page.locator('.l-rq-row').filter({hasText:'Older benefit'}).waitFor();ok(new URL(page.url()).searchParams.get('page')==='2','pagination persists in address');await page.goBack();await ready();ok(await page.locator('.l-rq-row').count()===5,'browser back restores first page');await fixture({records:data.records});
  for(const width of [1440,1280,1024,768,390,320]){
    await page.setViewportSize({width,height:1080});
    for(const [name,key] of [['benefit','benefit:1048'],['reward','redemption:2184']]){
      await go('?record='+key);await ready();await page.evaluate(()=>document.fonts.ready);
      ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1),name+' fits '+width+'px');
      if(width<=768)ok(await page.locator('.l-rq-columns').evaluate(e=>e.children[1].getBoundingClientRect().top>=e.children[0].getBoundingClientRect().bottom-1),name+' stacks columns at '+width+'px');
      if(width===390)await page.screenshot({path:root+'render-'+name+'-mobile.png',fullPage:true});
    }
    await page.locator('.l-rq-row').filter({hasText:'Referral bonus'}).click();await page.locator('dialog[open]').waitFor();
    ok(await page.locator('dialog[open]').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.height<=innerHeight&&e.scrollWidth<=e.clientWidth+1}),'referral overlay fits '+width+'px');
    if(width===390)await page.locator('dialog[open]').screenshot({path:root+'render-referral-mobile.png'});await page.keyboard.press('Escape');await page.locator('dialog[open]').waitFor({state:'hidden'});
  }
  await go();await ready();await page.locator('.l-rq-row').filter({hasText:'Complimentary coffee'}).click();await page.waitForFunction(()=>document.activeElement?.classList.contains('l-rq-detail'));ok(true,'mobile selection focuses and scrolls to detail');
  await page.setViewportSize({width:1440,height:1080});await go();await ready();await page.locator('.l-rq-row').filter({hasText:'Referral bonus'}).click();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Tab');ok(await page.evaluate(()=>document.querySelector('dialog[open]').contains(document.activeElement)),'dialog keeps keyboard focus');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.classList.contains('l-rq-row'));ok(await page.evaluate(()=>document.activeElement?.classList.contains('l-rq-row')),'dialog dismissal restores opener focus');
  const assets=await page.locator('[data-loyalty] img').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>({loaded:e.complete&&e.naturalWidth>0,w:e.width,h:e.height,nw:e.naturalWidth,nh:e.naturalHeight})));ok(assets.every(a=>a.loaded&&Math.abs(a.w-a.nw)<1&&Math.abs(a.h-a.nh)<1),'exported icons load at native geometry');
  await button('Settings').click();await button('Light').click();await page.locator('[data-loyalty][data-theme=light]').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-loyalty][data-overview]')).backgroundColor==='rgb(244, 246, 249)');await page.screenshot({path:root+'render-light.png',fullPage:true,animations:'disabled'});ok(true,'shared light theme remains usable');
  for(const lang of ['ru','de','fr','es']){
    await page.getByRole('button',{name:/^(Settings|Настройки|Einstellungen|Réglages|Configuración)$/}).click();await page.getByRole('combobox',{name:/Language|Язык|Sprache|Langue|Idioma/}).selectOption(lang);await page.keyboard.press('Escape');ok(!(await page.locator('.l-rq-page').innerText()).includes('Review requests, fulfil rewards'),lang+' translates Requests');await page.setViewportSize({width:390,height:1080});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),lang+' fits mobile');await page.screenshot({path:root+'render-'+lang+'.png',fullPage:true});await page.setViewportSize({width:1440,height:1080});
  }
  data=await fixture({});ok(data.errors.length===0,'no runtime errors');return {passed:checks.length,checks,errors:data.errors};
}
