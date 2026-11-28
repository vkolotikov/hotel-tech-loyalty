import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const base=process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE!=='loyalty_launch_demo' || process.env.DB_PORT!=='55459' || process.env.MAIL_MAILER!=='log') throw Error('Isolated launch environment required')
const fixture=JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE,'utf8')), run=Date.now().toString(36)
const out=path.resolve(process.env.LAUNCH_OUTPUT,'../admin-ux'), report={checks:[],errors:[],phase:'start',localOnly:true}
await fs.mkdir(out,{recursive:true})
const scrub=x=>Object.values(fixture.roles).reduce((s,r)=>s.replaceAll(r.password,'[redacted]'),String(x))
const exec=promisify(execFile)
// Carbon is intentionally frozen for deterministic dates; clear only this disposable demo's request counters between batches.
const resetCounters=()=>exec(process.env.PHP,[fileURLToPath(new URL('./launch-artisan.php',import.meta.url)),'cache:clear','--no-interaction'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),env:process.env,windowsHide:true,timeout:60000})
const check=(ok,name)=>{if(!ok)throw Error(name);report.checks.push(name);console.log('PASS '+name)}
const browser=await chromium.launch({channel:'chrome',headless:true}), ctx=await browser.newContext({viewport:{width:1440,height:900}})
await ctx.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort())
await ctx.addInitScript(()=>{if(!localStorage.getItem('admin_lang'))localStorage.setItem('admin_lang','en');if(!localStorage.getItem('loyalty:look'))localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}))})
const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(scrub(e.message)))
page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname.startsWith('/api/'))console.log(`HTTP ${r.status()} ${new URL(r.url()).pathname}`)})
page.on('requestfailed',r=>console.log(`REQUEST FAILED ${new URL(r.url()).pathname} ${r.failure()?.errorText}`))
async function call(endpoint,method='GET',data,auth=token){
 const response=await ctx.request.fetch(`${base}/api/v1/admin/loyalty/${endpoint}${endpoint.includes('?')?'&':'?'}brand_id=all`,{method,data,headers:{Accept:'application/json',Authorization:'Bearer '+auth}})
 const body=await response.json();if(response.status()>=400)throw Error(`${method} ${endpoint}: ${response.status()} ${body.error || ''}`);return body
}
let token
async function go(url){await page.goto(base+url);await page.locator('main h1').waitFor();await page.waitForFunction(()=>!document.querySelector('main .animate-pulse'));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150)}
try {
 await resetCounters()
 await page.goto(base+'/loyalty/login');await page.getByLabel('Email',{exact:true}).fill(fixture.roles.manager.email);await page.getByLabel('Password',{exact:true}).fill(fixture.roles.manager.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'))
 token=await page.evaluate(()=>localStorage.getItem('auth_token'))
 const boot=await call('bootstrap');let program=await call('program')
 if(program.tiers.length<2){for(const [i,name]of ['Silver','Gold'].entries())await call('program/tiers','POST',{name:`${name} ${run}`,min_points:i*1000,min_visits:i?null:0,min_spend:null,earn_rate:1+i*.5,description:null,color:null,is_active:true});program=await call('program')}
 const first=program.tiers.find(t=>t.is_active), top=program.tiers.filter(t=>t.is_active).at(-1)
 const perk=(await call('program/benefits','POST',{name:`Service discount ${run}`,code:'UX_'+run.toUpperCase(),category:'other',fulfillment_mode:'automatic',is_active:true})).benefit
 const unused=(await call('program/benefits','POST',{name:`Welcome drink ${run}`,code:'UX_UNUSED_'+run.toUpperCase(),category:'other',fulfillment_mode:'on_request',is_active:true})).benefit
 for(const [tier,value]of [[first,5],[top,15]])await call(`program/tiers/${tier.id}/benefits`,'POST',{benefit_id:perk.id,value:`${value}% service discount`,value_type:'percent_discount',value_amount:value,applies_to:'services'})
 const place=(await call('places','POST',{name:`Club lounge ${run}`,description:'Members’ lounge',admits:'tiers',tier_ids:[top.id],is_active:true,idempotency_key:'ux-place-'+run})).place
 const reward=(await call('rewards','POST',{name:`Spa reward ${run}`,description:'A relaxing treatment',terms:'Show your reward code at reception.',category:'spa',points_cost:500,stock:null,per_member_limit:1,discount_type:null,discount_value:null,applies_to:'all',expires_at:null,is_active:true})).reward
 const day=boot.venue.today, dayPlus=n=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
 const offer=(await call('offers','POST',{title:`Member spa offer ${run}`,description:'Save on eligible services.',type:'discount',value:20,code:'UX'+run.toUpperCase(),applies_to:'services',tier_ids:[top.id],start_date:day,end_date:dayPlus(7),usage_limit:50,per_member_limit:1,is_featured:false})).offer
 await call('program/boosts','POST',{name:`Double-points weekend ${run}`,description:'Automatic bonus during this schedule',multiplier:2,starts_at:dayPlus(1)+'T09:00',ends_at:dayPlus(2)+'T18:00',days_of_week:null,tier_ids:null,is_active:true})
 check(Boolean(perk.id&&place.id&&reward.id&&offer.id),'Real saved tier, perk, place, reward, offer and boost records created through existing APIs')

 report.phase='navigation'
 for(const [old,next]of [['/loyalty/options?tab=rules','settings=qualification'],['/loyalty/options?tab=rule&way=points_expiry','settings=points'],['/loyalty/program?tab=boosts','tab=bonus'],['/loyalty/program?tab=benefits','tab=benefits'],['/loyalty/options/setup','/program/setup'],['/loyalty/options?tab=overview','checks=1']]){await go(old);check(page.url().includes(next),`Legacy navigation ${old} reaches ${next}`)}
 await go('/loyalty/options?tab=earn');check(await page.locator('[data-record^="way-"]').count()===6,'Six earning triggers stay reachable in the canonical list')
 await call('options','PUT',{options:{points_per_currency:1}})
 await page.reload();await page.getByRole('button',{name:'Edit Purchase points',exact:true}).click();await page.getByLabel('Points for each €1 spent',{exact:true}).fill('2.5');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByText('Saved. Your program settings are up to date.',{exact:true}).waitFor()
 check((await call('options')).options.points_per_currency===2.5,'The purchase rate editor saves the single canonical setting')
 for(const key of ['points_on_spend','desk_earn']){await go(`/loyalty/options?tab=earn&selected=${key}`);check((await page.locator('#management-detail').innerText()).includes('2.5 pts'),'Inherited '+key+' preview uses the saved purchase rate')}

 report.phase='assignments'
 await go(`/loyalty/rewards?tab=benefits&selected=${perk.id}`);await page.locator('#management-detail select').selectOption(String(first.id));check((await page.locator('#management-detail').innerText()).includes('5% off'),'Perk preview follows the explicitly selected first tier')
 await page.locator('#management-detail select').selectOption(String(top.id));check((await page.locator('#management-detail').innerText()).includes('15% off'),'Perk preview uses the selected top tier’s own value')
 await go(`/loyalty/rewards?tab=benefits&selected=${unused.id}&assign=${unused.id}`);const chooser=page.getByRole('dialog');await chooser.getByLabel('Choose a tier',{exact:true}).selectOption(String(top.id));await chooser.getByRole('button',{name:'Manage assignment',exact:true}).click();await page.getByRole('dialog').getByText(top.name,{exact:false}).first().waitFor();check(await page.getByRole('dialog').count()===1,'Unassigned perk action reaches the shared tier assignment editor');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click()
 await go(`/loyalty/program?tab=tiers&selected=${top.id}`);await page.getByRole('button',{name:'Add perk',exact:false}).click();check(await page.getByRole('dialog').count()===1,'Levels uses the same assignment editor');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click()

 report.phase='screens'
 const screens={levels:`/loyalty/program?tab=tiers&selected=${top.id}`,places:`/loyalty/program?tab=places&selected=${place.id}`,setup:'/loyalty/program/setup',earning:'/loyalty/options?tab=earn',bonuses:'/loyalty/options?tab=bonus&selected=referrals',rewards:`/loyalty/rewards?selected=${reward.id}`,perks:`/loyalty/rewards?tab=benefits&selected=${perk.id}`,offers:`/loyalty/rewards?tab=offers&selected=${offer.id}`}
 // Each image is an actual compiled page backed by the isolated database; no mocked business responses.
 for(const theme of ['dark','light'])for(const width of [1440,390]){
  await resetCounters()
  await page.setViewportSize({width,height:900});await page.evaluate(v=>localStorage.setItem('loyalty:look',JSON.stringify({theme:v,rail:'full'})),theme)
  for(const [name,url]of Object.entries(screens)){await go(url);await page.locator(`[data-loyalty][data-theme="${theme}"]`).waitFor();await page.screenshot({path:path.join(out,`${name}-${theme}-${width}.png`),fullPage:true});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}px in ${theme}`)}
 }
 await page.setViewportSize({width:1440,height:900})
 for(const lang of ['en','ru','de','fr','es']){
  await resetCounters();await page.evaluate(v=>localStorage.setItem('admin_lang',v),lang)
  const words=JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/adminux.${lang}.json`,import.meta.url),'utf8'))
  const rewardWords=JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/rewarddesign.${lang}.json`,import.meta.url),'utf8'))
  const designWords=JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/redesign.${lang}.json`,import.meta.url),'utf8'))
  const titles={levels:words.levels,places:words.places,setup:designWords.guidedSetup,earning:words.earning,bonuses:words.bonuses,rewards:rewardWords.pointsRewards,perks:words.perks,offers:rewardWords.offers}
  for(const [name,url]of Object.entries(screens)){
   await go(url);const main=await page.locator('main').innerText(),title=await page.locator('main h1').innerText()
   check(!main.includes('loyalty.adminux.')&&typeof titles[name]==='string'&&title===titles[name],`${lang} ${name} uses the registered translations`)
  }
 }
 check(report.errors.length===0,'Compiled journeys have no browser runtime errors')
 report.phase='complete'
}catch(error){report.error=scrub(error.stack||error);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;console.error(report.error)}finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({phase:report.phase,checks:report.checks.length,runtimeErrors:report.errors.length}))}
