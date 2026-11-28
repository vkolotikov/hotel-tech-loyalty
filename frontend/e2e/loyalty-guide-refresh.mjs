import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
if(process.env.DB_DATABASE!=='loyalty_launch_demo'||process.env.DB_PORT!=='55459'||process.env.MAIL_MAILER!=='log')throw Error('Isolated rehearsal required')
const base=process.env.LAUNCH_BASE||'http://127.0.0.1:5819'
if(new URL(base).hostname!=='127.0.0.1')throw Error('Loopback only')
const fixture=JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE,'utf8')),out='C:/wamp64/tmp/loyalty-guide-browser-20261111',report={checks:[],errors:[]}
await fs.mkdir(out,{recursive:true})
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);console.log('PASS '+label)}
const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext(),page=await ctx.newPage()
page.on('pageerror',e=>report.errors.push(e.message))
await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort())
try{
 await page.goto(base+'/loyalty/login');await page.getByLabel('Email',{exact:true}).fill(fixture.roles.manager.email);await page.getByLabel('Password',{exact:true}).fill(fixture.roles.manager.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'))
 for(const lang of ['en','de','fr','es','ru'])for(const theme of ['dark','light'])for(const width of [1440,390]){
  await promisify(execFile)(process.env.PHP,['frontend/e2e/launch-artisan.php','cache:clear'],{cwd:path.resolve(import.meta.dirname,'../..'),env:process.env,windowsHide:true})
  const bundle=JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/guide.${lang}.json`,import.meta.url),'utf8'))
  await page.evaluate(({lang,theme})=>{localStorage.setItem('admin_lang',lang);localStorage.setItem('loyalty:look',JSON.stringify({theme,rail:'full'}))},{lang,theme});await page.setViewportSize({width,height:1000});await page.goto(base+'/loyalty/guide');await page.locator('[data-guide-walk="offer"]').waitFor();await page.evaluate(()=>document.fonts.ready)
  const summary=page.locator('[data-guide-walk="offer"] summary');await summary.focus();await page.keyboard.press('Enter');await page.locator('[data-guide-walk="offer"][open]').waitFor();check(await page.locator('[data-guide-walk="offer"] ol li').count()===3,`${lang} ${theme} ${width}: keyboard expands three translated voucher steps`)
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${lang} ${theme} ${width}: layout fits`)
  if(theme==='dark'&&((lang==='en'&&width===1440)||(lang==='de'&&width===390)))await page.screenshot({path:path.join(out,`${lang}-${width}.png`),fullPage:true})
  await page.getByRole('searchbox').fill('PDF');await page.locator('[data-guide-faq="offer_send"][open]').waitFor();check(await page.locator('[data-guide-walk]').count()===1,`${lang} ${theme} ${width}: search finds workflow and opens matching FAQ`)
  await page.getByRole('searchbox').fill('zzzzzzzz');await page.getByText(bundle.page.nothing,{exact:true}).waitFor();await page.getByRole('button',{name:bundle.page.clear,exact:true}).click();check(await page.locator('[data-guide-walk]').count()===4,`${lang} ${theme} ${width}: empty search can reset`)
 }
 check(report.errors.length===0,'No runtime errors');await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))
}finally{await browser.close()}
