async(page)=>{
  page.setDefaultTimeout(5000);
  const checks=[];
  const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
  const control=patch=>page.evaluate(async patch=>(await fetch('/__fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)})).json(),patch);
  const card=count=>({enabled:true,stamps_per_card:8,reward:{kind:'points',points:100},card:{id:7,number:1,stamps_count:count,stamps_needed:8,completed_at:null,stamps:[]},completed_cards:0});
  await control({member:{current_points:800,recent_activity:[]},event:{my:'signed_up',checked_in:false,can_sign_up:false,can_cancel:true},stamps:card(3),clearLog:true});
  await page.goto('http://127.0.0.1:5837/');await page.getByRole('button',{name:'Your balances',exact:true}).waitFor();
  await page.waitForTimeout(500);
  check(!await page.getByTestId('member-feedback').count(),'historical stamp card does not trigger celebration');
  await page.waitForTimeout(10500);await control({event:{checked_in:true}});
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await page.getByTestId('member-feedback').getByText('Check-in recorded',{exact:true}).waitFor();checks.push('staff-confirmed check-in is acknowledged');
  await page.waitForTimeout(200);
  const pulse=page.getByTestId('award-pulse');
  check(await pulse.count() && Number(await pulse.evaluate(n=>getComputedStyle(n).opacity))>0,'confirmed check-in gives the member card a brief pulse');
  await page.getByTestId('member-feedback').waitFor({state:'detached'});
  await page.waitForTimeout(10500);await control({stamps:card(4)});
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await page.getByTestId('member-feedback').getByText('Stamp card updated',{exact:true}).waitFor();checks.push('a new server stamp is acknowledged');
  check((await control({})).log.every(r=>r.method==='GET'),'feedback observes facts without writing points stamps or check-ins');
  await page.goto('http://127.0.0.1:5837/');await page.getByRole('button',{name:'Your balances',exact:true}).waitFor();await page.waitForTimeout(500);
  check(!await page.getByTestId('member-feedback').count(),'returning to the app does not celebrate historical attendance or stamps');
  return {checks:checks.length,names:checks};
}
