// Local intercepted fixtures only. No customer or provider requests.
async (page, { state, root, base }) => {
  const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};
  const open=async path=>{await page.goto(base+path);await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready)};
  const shot=async name=>page.screenshot({path:root+name+'.png',animations:'disabled'});
  const tiers=state.program.tiers;
  tiers[0].color='#e8ae89';tiers[1].color='#bed7f5';
  state.program.boosts=[
    {id:1,name:'Autumn bonus',description:'Eligible earning during the promotion.',multiplier:2,starts_at:'2026-10-27T00:00:00Z',ends_at:'2026-10-28T00:00:00Z',days_of_week:null,tier_ids:null,is_active:true,state:'live'},
    {id:2,name:'Weekend boost',description:null,multiplier:2,starts_at:'2026-10-30T18:00:00Z',ends_at:'2026-11-02T00:00:00Z',days_of_week:[5,6,0],tier_ids:[2,3],is_active:true,state:'upcoming'},
    {id:3,name:'Summer bonus',description:null,multiplier:1.5,starts_at:'2026-06-01T00:00:00Z',ends_at:'2026-08-01T00:00:00Z',days_of_week:null,tier_ids:null,is_active:true,state:'ended'},
    {id:4,name:'Paused boost',description:null,multiplier:3,starts_at:null,ends_at:null,days_of_week:null,tier_ids:[3],is_active:false,state:'off'},
  ];
  state.placeData={tiers,can_change:true,places:[
    {id:1,name:'Club lounge',description:'Main floor',admits:'tiers',tiers:[tiers[2]],is_active:true,sort_order:1,today:{granted:14,denied:2}},
    {id:2,name:'Wellness area',description:'Spa reception',admits:'tiers',tiers:[tiers[1],tiers[2]],is_active:true,sort_order:2,today:{granted:8,denied:1}},
    {id:3,name:'Members terrace',description:null,admits:'all',tiers:[],is_active:false,sort_order:3,today:{granted:1,denied:0}},
  ]};
  await open('/loyalty/program');await page.locator('[data-tier]').first().waitFor();
  check(await page.locator('.l-rd-subnav a').filter({hasText:'Membership benefits'}).count()===0,'Program navigation has no duplicate membership-benefit section');
  check(await page.locator('.l-pg-tools a').count()===2,'Program tools are Places and Boosts');
  check(await page.locator('.l-pg-flow .l-pg-icon').count()===3,'Qualification flow has three design icons');
  check(await page.locator('.l-rd-tier-card').count()===3,'All actual levels remain in the ladder');await shot('levels-dark');
  await page.locator('[data-tier="3"]').getByRole('button',{name:'+1 more benefits',exact:true}).click();await page.locator('[data-tier-places="3"]').waitFor();check((await page.locator('[data-tier="3"]').innerText()).includes('Until 2 pm')&&(await page.locator('[data-tier="3"]').innerText()).includes('Can enter:'),'Level details retain structured benefit values and access information');
  await open('/loyalty/program?tab=benefits&selected=2&q=discount');await page.waitForURL(u=>u.pathname==='/loyalty/rewards');
  check(new URL(page.url()).searchParams.get('selected')==='2'&&new URL(page.url()).searchParams.get('q')==='discount','Old benefits URL redirects to Rewards with filters and selection');
  await page.getByRole('heading',{name:'Membership benefits',exact:true}).first().waitFor();check(true,'Rewards owns the membership-benefit catalogue');
  await open('/loyalty/program?tab=boosts');await page.locator('.l-pg-boost-row').first().waitFor();
  check(await page.locator('.l-pg-boost-row').count()===2,'Boost directory initially shows live and upcoming events');
  await page.getByRole('button',{name:'Weekend boost',exact:true}).last().click();
  check((await page.locator('.l-pg-boost-preview').innerText()).includes('Fri, Sat, Sun'),'Selected boost preserves its weekdays');
  check(await page.locator('.l-pg-boost-preview [data-tier-chip]').count()===2,'Selected boost preserves eligible levels');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('all');
  check(await page.locator('.l-pg-boost-row').count()===4,'All statuses exposes ended and switched-off boosts');
  await page.getByRole('searchbox',{name:'Search boosts',exact:true}).fill('Paused');
  check(await page.locator('.l-pg-boost-row').count()===1&&(await page.locator('.l-pg-boost-preview').innerText()).includes('×3'),'Search updates the list and preview immediately');
  await page.getByRole('searchbox').fill('No match');
  check(await page.locator('.l-pg-boost-preview').count()===0,'Empty filters do not leave a stale preview');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('name');
  check((await page.locator('.l-pg-boost-identity strong').allTextContents()).join('|')==='Autumn bonus|Paused boost|Summer bonus|Weekend boost','Boost name sorting is applied immediately');
  await page.getByRole('button',{name:'Autumn bonus',exact:true}).last().click();await shot('boosts-dark');
  await page.getByRole('button',{name:'Edit Autumn bonus',exact:true}).click();
  check(await page.getByRole('dialog').count()===1,'Boost editing opens the existing validated form');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'More Autumn bonus',exact:true}).click();await page.getByRole('menuitem',{name:'Remove',exact:true}).click();check(await page.getByRole('dialog').count()===1,'Boost removal still requires the existing confirmation');await page.getByRole('button',{name:'Keep it',exact:true}).click();
  await open('/loyalty/program?tab=places');await page.locator('.l-pg-place-card').first().waitFor();
  check(await page.locator('.l-pg-place-figures strong').allTextContents().then(v=>v.join('|')==='3|2|23'),'Places figures use real total, active and granted-today values');
  check(await page.locator('.l-pg-place-card').count()===3,'Places includes switched-off records');await shot('places-dark');
  await page.getByRole('combobox',{name:'Eligible level',exact:true}).selectOption('2');
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('active');
  check(await page.locator('.l-pg-place-card').count()===1&&(await page.locator('.l-pg-place-card').innerText()).includes('Wellness area'),'Level and active-status choices combine immediately');
  await page.getByRole('searchbox',{name:'Search places',exact:true}).fill('No match');await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  check(await page.locator('.l-pg-place-card').count()===3,'Clear filters restores the directory');
  await page.getByRole('button',{name:'Edit Club lounge',exact:true}).click();
  check(await page.getByRole('dialog').count()===1,'Manage place opens the existing place dialog');await page.keyboard.press('Escape');
  const writes=state.requests.filter(r=>r.method!=='GET'&&r.path!=='__fixture');check(writes.length===0,'Directory filtering and record selection never write data');
  state.limited=true;await open('/loyalty/program?tab=places');await page.locator('.l-pg-place-card').first().waitFor();
  check(await page.getByRole('button',{name:'Add a place',exact:true}).count()===0&&await page.getByRole('button',{name:'Edit Club lounge',exact:true}).count()===0,'Read-only staff cannot add or manage places');
  state.limited=false;
  for(const width of [1440,1280,1024,768,390,320]){
    await page.setViewportSize({width,height:1080});
    for(const [name,path,ready]of [['levels','/loyalty/program','[data-tier]'],['boosts','/loyalty/program?tab=boosts','.l-pg-boost-row'],['places','/loyalty/program?tab=places','.l-pg-place-card']]){
      await open(path);await page.locator(ready).first().waitFor();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits '+width);if(width===1024||width===390)await shot(name+'-'+width);
    }
  }
  check(state.errors.length===0,'No application runtime errors');return checks;
}
