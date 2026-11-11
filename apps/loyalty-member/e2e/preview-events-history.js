async(page)=>{
  page.setDefaultTimeout(5000);
  await page.evaluate(async()=>fetch('/__fixture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({capabilities:{events:false,loyalty:false},member:{membership_mode:'assigned'}})}));
  await page.goto('http://127.0.0.1:5837/events');
  await page.getByText('Summer reception',{exact:true}).waitFor();
  if(new URL(page.url()).pathname!=='/events')throw Error('Historical Events deep link was redirected while history loaded');
  if(await page.getByRole('button',{name:'Sign up',exact:true}).count())throw Error('Disabled Events exposed registration');
  return {checks:2,names:['disabled Events deep link waits for and shows attended history','disabled Events expose no registration']};
}
