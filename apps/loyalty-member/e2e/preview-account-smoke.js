async(page)=>{
  const checks=[];
  const check=(value,name)=>{if(!value)throw Error(name);checks.push(name)};
  const control=patch=>page.evaluate(async patch=>(await fetch('/__fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)})).json(),patch);
  await page.goto('http://127.0.0.1:5837/profile');
  const birthday=page.getByPlaceholder('YYYY-MM-DD');await birthday.waitFor();
  await birthday.fill('1991-01-01');await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByText('Saved',{exact:true}).waitFor();checks.push('birthday save');
  await control({user:{date_of_birth:'1992-02-02'}});
  await page.waitForTimeout(10500);
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('input[placeholder="YYYY-MM-DD"]')?.value==='1992-02-02');
  checks.push('birthday follows a later staff refresh');
  await page.getByRole('textbox').first().fill('Member A pending');
  await control({profileDelay:1800});
  // The cache is already stale from the foreground refresh only after LIVE_MS.
  await page.waitForTimeout(10500);
  const requested=page.waitForRequest(r=>r.url().includes('/v1/member/profile') && r.method()==='PUT');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await requested;
  await control({user:{id:2,name:'Member B current',date_of_birth:'1993-03-03'}});
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('input[autocomplete="name"]')?.value==='Member B current');
  await page.waitForTimeout(2200);
  check(await page.getByRole('textbox').first().inputValue()==='Member B current','late A save cannot overwrite current B profile');
  check(await birthday.inputValue()==='1993-03-03','late A save cannot overwrite current B birthday');
  const saves=(await control({})).log.filter(r=>r.path==='/v1/member/profile' && r.method==='PUT');
  check(!Object.hasOwn(saves.at(-1).body,'date_of_birth'),'name-only save omits previously saved birthday');
  await control({profileDelay:0});
  await page.goto('http://127.0.0.1:5837/inbox');
  await page.getByRole('button',{name:'Mark all as read',exact:true}).click();
  await page.getByRole('button',{name:'Mark all as read',exact:true}).waitFor({state:'detached'});
  checks.push('session-scoped mark all updates current inbox');
  await page.getByRole('button',{name:'Your private voucher',exact:true}).click();
  await page.getByRole('button',{name:'View offer',exact:true}).click();
  await page.getByText('Your personal member voucher',{exact:true}).waitFor();
  check(new URL(page.url()).searchParams.get('tab')==='offers','inbox CTA still opens Offers');
  return {checks:checks.length,names:checks};
}
