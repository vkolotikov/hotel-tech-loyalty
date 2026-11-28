import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

if(process.env.DB_DATABASE!=='loyalty_launch_demo'||process.env.DB_PORT!=='55459'||process.env.MAIL_MAILER!=='log')throw Error('Isolated rehearsal required')
const base=process.env.LAUNCH_BASE||'http://127.0.0.1:5819'
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback only')
const fixture=JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE,'utf8')),out=path.resolve(process.env.LAUNCH_OUTPUT,'../offer-audience-polish'),report={checks:[],errors:[]}
await fs.mkdir(out,{recursive:true})
const check=(ok,name)=>{if(!ok)throw Error(name);report.checks.push(name);console.log('PASS '+name)}
const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url))
const clear=()=>exec(process.env.PHP,[fileURLToPath(new URL('./launch-artisan.php',import.meta.url)),'cache:clear'],{cwd:root,env:process.env,windowsHide:true,timeout:60000})
const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000}})
await ctx.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort())
await ctx.addInitScript(()=>{if(!localStorage.getItem('admin_lang'))localStorage.setItem('admin_lang','en');if(!localStorage.getItem('loyalty:look'))localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}))})
const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message))
try{
 await clear();await page.goto(base+'/loyalty/login');await page.getByLabel('Email',{exact:true}).fill(fixture.roles.manager.email);await page.getByLabel('Password',{exact:true}).fill(fixture.roles.manager.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'))
 const token=await page.evaluate(()=>localStorage.getItem('auth_token'))
 const call=async(route,method='GET',data)=>{const r=await ctx.request.fetch(base+'/api/v1/admin/loyalty/'+route+'?brand_id=all',{method,data,headers:{Accept:'application/json',Authorization:'Bearer '+token}});if(!r.ok())throw Error(route+' '+r.status());return r.json()}
 let programme=await call('program')
 for(const [i,name]of ['Bronze','Silver','Gold','Platinum','Diamond'].entries())if(!programme.tiers.some(t=>t.name===name)){await call('program/tiers','POST',{name,min_points:(i+10)*10000,min_visits:null,min_spend:null,earn_rate:1+i*.25,description:null,color:null,is_active:true});programme=await call('program')}
 await page.goto(base+'/loyalty/rewards?tab=offers&offer=new');let dialog=page.getByRole('dialog');await dialog.getByRole('radiogroup').waitFor()
 const all=dialog.getByRole('button',{name:'All members',exact:true}),bronze=dialog.getByRole('checkbox',{name:'Bronze',exact:true})
 check(await all.getAttribute('aria-pressed')==='true','All members starts selected')
 await bronze.check();check(await bronze.isChecked()&&await all.getAttribute('aria-pressed')==='false','Level tile selects its native checkbox')
 await bronze.focus();await bronze.press('Space');check(!await bronze.isChecked()&&await all.getAttribute('aria-pressed')==='true','Keyboard toggling restores the all-member state')
 await bronze.check();await dialog.getByRole('checkbox',{name:'Gold',exact:true}).check();await all.click();check(await dialog.getByRole('checkbox').filter({visible:true}).count()>0&&(await dialog.locator('.l-offer-level-options input:checked').count())===0,'Flat all-member control clears selected levels')
 await dialog.getByRole('radio',{name:'Selected members only',exact:true}).check();await dialog.getByLabel('Find members',{exact:true}).waitFor();check(await dialog.locator('.l-offer-levels').count()===0,'Individual-member mode exposes its picker directly')
 await dialog.getByRole('radio',{name:'Programme members and levels',exact:true}).check();check(await all.getAttribute('aria-pressed')==='true','Switching audience preserves the programme selection')
 for(const lang of ['en','de','es','fr','ru'])for(const theme of ['dark','light'])for(const width of [390,1440]){
  await clear();await page.evaluate(({lang,theme})=>{localStorage.setItem('admin_lang',lang);localStorage.setItem('loyalty:look',JSON.stringify({theme,rail:'full'}))},{lang,theme});await page.setViewportSize({width,height:1000});await page.goto(base+'/loyalty/rewards?tab=offers&offer=new');dialog=page.getByRole('dialog');await dialog.getByRole('radiogroup').waitFor();await page.evaluate(()=>document.fonts.ready)
  const words=JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/personal.${lang}.json`,import.meta.url),'utf8'))
  check(await dialog.getByRole('radio',{name:words.individual,exact:true}).count()===1,`${lang} ${theme} ${width}px translates the audience choices`)
  const layout=await dialog.evaluate(e=>({overflow:e.scrollWidth>e.clientWidth+2,page:document.documentElement.scrollWidth>window.innerWidth+2,choices:[...e.querySelectorAll('.l-offer-level-option')].every(n=>n.getBoundingClientRect().height>=38),shadow:getComputedStyle(e.querySelector('.l-offer-all')).boxShadow}))
  check(!layout.overflow&&!layout.page&&layout.choices&&layout.shadow==='none',`${lang} ${theme} ${width}px choices fit and stay flat`)
  await dialog.locator('.l-offer-audience').locator('..').scrollIntoViewIfNeeded();if(['en','de'].includes(lang))await page.screenshot({path:path.join(out,`${lang}-${theme}-${width}.png`),fullPage:true})
 }
 check(report.errors.length===0,'No browser runtime errors')
}catch(e){report.failure=e.message;console.error(e.message);process.exitCode=1}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close()}
