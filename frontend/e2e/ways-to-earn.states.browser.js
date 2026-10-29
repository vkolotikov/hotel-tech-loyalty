// Run after the isolated fixture harness. No live requests or production changes.
async(page)=>{
  page.setDefaultTimeout(8000);
  const base=new URL(page.url()).origin,checks=[];
  const root='C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/ways-to-earn/';
  const fixture=patch=>page.evaluate(async p=>(await fetch('/api/v1/admin/loyalty/__fixture',p?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}:undefined)).json(),patch);
  const original=structuredClone((await fixture()).answer);
  const ok=(condition,name)=>{if(!condition)throw Error(name);checks.push(name)};
  const go=async search=>{await page.goto(base+'/loyalty/options'+search);await page.locator('.l-earn-page, #options-tab-overview').waitFor()};
  try{
    await fixture({limited:true});await go('?way=earn_rate');
    ok(await page.getByRole('button',{name:'Save changes',exact:true}).count()===0&&await page.locator('[data-field="points_per_currency"] input').isDisabled(),'read-only purchase removes writes and disables controls');
    await go('?tab=bonus');
    ok(await page.getByRole('button',{name:/Save bonus|Save rules/}).count()===0,'read-only bonus and rules remove writes');
    await fixture({limited:false,empty:true});await go('');
    await page.getByText('No earning methods are available.').waitFor();checks.push('server-empty response renders honest empty state');
    await fixture({empty:false,fail:true});await page.reload();
    await page.getByRole('button',{name:/Retry|Try again/}).waitFor({timeout:20000});
    ok(await page.locator('[data-way]').count()===0,'failed read does not show fabricated or stale earning rows');
    await fixture({fail:false});await page.getByRole('button',{name:/Retry|Try again/}).click();
    await page.locator('[data-way="earn_rate"]').waitFor();checks.push('failed read recovers on retry');
    await go('?tab=overview');
    await page.locator('#options-tab-overview').waitFor();checks.push('original checks and member journey remain reachable');
    await go('');
    ok(await page.getByRole('link',{name:'Guided setup',exact:true}).getAttribute('href')==='/loyalty/options/setup','existing setup wizard route preserved');
    const future=structuredClone(original);future.ways.push({key:'future_method',fields:[],switch:null,zero_off:null});
    await fixture({answer:future});await go('?tab=more');
    await page.locator('[data-way="future_method"]').waitFor();checks.push('unknown server methods retain More fallback');
    await fixture({answer:original});
    for(const width of [1440,1024,390,320]){
      await page.setViewportSize({width,height:width>1000?1080:844});
      for(const [name,search] of [['earning',''],['purchase','?way=earn_rate'],['bonuses','?tab=bonus'],['rules','?tab=rule']]){
        await go(search);await page.evaluate(()=>document.fonts.ready);
        const fit=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
        ok(fit.doc<=fit.width+1&&fit.body<=fit.width+1,`${name} fits ${width}px without horizontal overflow`);
        if(width===390||width===1440)await page.screenshot({path:root+`render-${name}-${width}.png`,fullPage:false});
      }
    }
    await page.setViewportSize({width:390,height:844});await go('');
    await page.locator('.l-ov-menu-button').click();await page.getByRole('dialog').waitFor();
    ok(await page.getByRole('dialog').getByRole('link',{name:'Bonuses',exact:true}).isVisible(),'mobile menu exposes Ways subpages');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'+ Add earning rule',exact:true}).click();await page.getByRole('dialog').waitFor();
    ok(await page.getByRole('dialog').evaluate(e=>e.getBoundingClientRect().width<=innerWidth),'method chooser fits mobile');
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:1440,height:1080});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Light',exact:true}).click();
    await page.locator('[data-loyalty][data-theme="light"]').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-loyalty]')).backgroundColor==='rgb(244, 246, 249)');
    await page.screenshot({path:root+'render-light.png',fullPage:false});checks.push('shared light theme works');
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('ru');
    await page.keyboard.press('Escape');
    ok(!(await page.locator('.l-earn-page').innerText()).includes('Ways to earn'),'Russian content replaces English');
    await page.screenshot({path:root+'render-russian.png',fullPage:false});
    await page.setViewportSize({width:320,height:844});
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Russian light page fits 320px');
    return {passed:checks.length,checks,errors:(await fixture()).errors};
  }catch(error){return {passed:checks.length,checks,error:String(error),url:page.url()}}
}
