async(page)=>{
  page.setDefaultTimeout(5000);
  const control=patch=>page.evaluate(async patch=>(await fetch('/__fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(patch)})).json(),patch);
  await control({capabilities:{loyalty:true,events:true},member:{current_points:800,recent_activity:[]},event:{my:'none',checked_in:false,can_sign_up:true,can_cancel:false}});
  // A fresh Events document leaves Home unmounted when the confirmed award arrives.
  await page.goto('http://127.0.0.1:5837/events');
  await page.getByRole('button',{name:'Sign up',exact:true}).waitFor();
  await control({member:{current_points:950,recent_activity:[{id:501,points:150,type:'earn',description:'Confirmed demo visit',created_at:'2026-11-11T10:05:00Z'}]}});
  await page.getByRole('button',{name:'Sign up',exact:true}).click();
  await page.getByTestId('member-feedback').getByText('+150 points',{exact:true}).waitFor();
  await page.getByTestId('member-feedback').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Your balances',exact:true}).waitFor();
  await page.waitForTimeout(320);
  const arrival=page.getByTestId('points-arrival');
  if(await arrival.count() && Number(await arrival.evaluate(n=>getComputedStyle(n).opacity))>0.05)throw Error('Old points award replayed when Home was opened later');
  return {checks:3,names:['new server ledger entry produces confirmed points feedback','feedback dismisses automatically','late Home navigation does not replay the points animation']};
}
