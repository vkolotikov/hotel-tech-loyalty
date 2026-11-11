async (page) => {
  const checks=[],errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
  const control=patch=>page.evaluate(async patch=>(await fetch('/__fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)})).json(),patch);
  const go=async path=>{await page.goto('http://127.0.0.1:5837'+path);await page.locator('body').waitFor();};
  const text=()=>page.locator('body').innerText();

  await go('/programme');await page.getByText('Private studio',{exact:true}).waitFor();
  check((await text()).includes('2 points per €1.00'),'canonical earning rate');
  check((await text()).includes('Platinum members'),'canonical restricted access');
  await go('/events');await page.getByRole('button',{name:'Sign up',exact:true}).click();
  await page.getByRole('button',{name:'Cancel my sign-up',exact:true}).waitFor();
  check((await text()).includes('You’re signed up'),'event registration state');
  await page.getByRole('button',{name:'Cancel my sign-up',exact:true}).click();
  await page.getByRole('button',{name:'Sign up',exact:true}).waitFor();checks.push('event cancellation');

  await go('/rewards?tab=catalogue');await page.getByText('Coffee for two',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Redeem',exact:true}).click();
  check((await control({})).redemptionCount===0,'redemption requires explicit confirmation');
  await page.getByRole('button',{name:'Confirm',exact:true}).dblclick();
  await page.getByText(/DEMO-REWARD-1/).waitFor();
  check((await control({})).redemptionCount===1,'double confirmation submits once');

  await go('/rewards?tab=offers');await page.getByText('Your personal member voucher',{exact:true}).waitFor();
  check((await text()).includes('One per member. Show at the desk.'),'offer terms are visible');
  const promised=page.waitForEvent('download');await page.getByRole('button',{name:'Download voucher',exact:true}).click();
  const file=await promised;check(file.suggestedFilename()==='member-voucher.pdf','authenticated voucher download');
  const downloadedPath=await file.path();
  await go('/inbox');await page.getByRole('button',{name:'Your private voucher',exact:true}).click();
  await page.getByRole('button',{name:'View offer',exact:true}).click();
  await page.getByText('Your personal member voucher',{exact:true}).waitFor();
  check(new URL(page.url()).searchParams.get('tab')==='offers','inbox opens the Offers tab');

  await go('/card');await page.getByText('DEMO-000001',{exact:true}).waitFor();
  check(!/Add to (Apple|Google) Wallet/.test(await text()),'unconfigured Wallet actions hidden');
  await page.setViewportSize({width:320,height:750});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'QR fits a narrow phone');
  for(const path of ['/book','/book/appointment','/book/stay','/bookings','/booking/stay/1']){
    await go(path);await page.waitForURL('http://127.0.0.1:5837/');check(true,`excluded route ${path} redirects`);
  }
  const before=await control({capabilities:{loyalty:false,events:false},member:{membership_mode:'assigned',membership:{state:'scheduled',valid_from:'2026-12-01',valid_until:'2027-12-01'}}});
  check(!before.log.some(r=>/\/portal\/(?:bookings|services|stays)/.test(r.path)),'excluded booking routes issue no booking API calls');
  await go('/');await page.getByText(/Membership starts/).waitFor();
  check(!(await text()).includes('POINTS BALANCE'),'points-off card hides balance');
  check((await text()).includes('Members lounge'),'assigned benefits remain on Home');
  await go('/rewards?tab=catalogue');await page.getByText('Your assigned membership benefit.',{exact:true}).waitFor();
  check(!await page.getByRole('tab',{name:'Catalogue',exact:true}).count(),'points-off catalogue hidden');
  await go('/events');await page.getByText('Summer reception',{exact:true}).waitFor();
  check(!await page.getByRole('button',{name:'Sign up',exact:true}).count(),'disabled Events have no registration controls');
  checks.push('attended event history remains accessible');
  await go('/more');await page.getByRole('button',{name:/Events/}).waitFor();checks.push('event history has a navigation entry');

  await control({capabilities:{loyalty:true,events:true},member:{membership_mode:'earned',membership:{state:'active',valid_from:'2026-01-01',valid_until:'2027-01-01'}}});
  await go('/profile');const birthday=page.getByPlaceholder('YYYY-MM-DD');await birthday.waitFor();
  await birthday.fill('1991-01-01');await page.getByRole('button',{name:/^Save/}).first().click();
  await page.getByText('Saved',{exact:true}).waitFor();
  await control({user:{date_of_birth:'1992-02-02'}});
  await page.waitForTimeout(10500);
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('input[placeholder="YYYY-MM-DD"]')?.value==='1992-02-02');
  await page.getByRole('textbox').first().fill('Alex Updated');
  await page.getByRole('button',{name:/^Save/}).first().click();
  await page.waitForTimeout(400);
  const lastSave=(await control({})).log.filter(r=>r.path==='/v1/member/profile' && r.method==='PUT').at(-1);
  check(!Object.hasOwn(lastSave.body,'date_of_birth'),'name-only save after a prior birthday save preserves a later staff birthday change');

  for(const language of ['en','ru','de','fr','es']){
    for(const width of [320,393]){
      await page.setViewportSize({width,height:852});
      for(const path of ['/','/card','/programme','/rewards?tab=offers','/events','/help']){
        const separator=path.includes('?')?'&':'?';await go(path+separator+'lang='+language);
        await page.waitForTimeout(300);
        const body=await text();
        check(!/portal\.[a-z]|member\.[a-z]|\{\{/.test(body),`${language} ${width} ${path} translated`);
        check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${language} ${width} ${path} fits`);
      }
    }
  }
  await page.setViewportSize({width:393,height:852});await go('/');
  await page.getByText('Aurora Members Club',{exact:true}).first().waitFor();
  await page.screenshot({path:'C:/wamp64/www/Hexa-Tech/.playwright-mcp/member-loyalty-home-20261111.png'});
  await control({clearLog:true});await go('/events?out=1');
  await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  check(!(await control({})).log.some(r=>r.path.startsWith('/v1/member/')),'signed-out event deep link makes no member API request');
  check(errors.length===0,'no browser runtime errors');
  return {checks:checks.length,names:checks,downloadedPath,errors};
}
