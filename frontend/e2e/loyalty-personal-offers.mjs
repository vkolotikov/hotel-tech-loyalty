import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

if(process.env.DB_DATABASE!=='loyalty_launch_demo'||process.env.DB_PORT!=='55459'||process.env.MAIL_MAILER!=='log')throw Error('Isolated rehearsal required')
const base='http://127.0.0.1:5819',fixture=JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE,'utf8')),run=Date.now().toString(36)
const out=path.resolve(process.env.LAUNCH_OUTPUT,'../personal-offers'),report={checks:[],errors:[]},contexts=[]
await fs.mkdir(out,{recursive:true})
const check=(ok,name)=>{if(!ok)throw Error(name);report.checks.push(name);console.log('PASS '+name)}
const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url))
const artisan=(...args)=>exec(process.env.PHP,[fileURLToPath(new URL('./launch-artisan.php',import.meta.url)),...args],{cwd:root,env:process.env,windowsHide:true,timeout:60000})
const browser=await chromium.launch({channel:'chrome',headless:true})
async function context(){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(ctx);await ctx.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());await ctx.addInitScript(()=>{if(!localStorage.getItem('admin_lang'))localStorage.setItem('admin_lang','en');if(!localStorage.getItem('loyalty:look'))localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}))});const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));return{ctx,page}}
async function api(ctx,token,route,method='GET',data){const r=await ctx.request.fetch(base+'/api/v1/'+route,{method,data,headers:{Accept:'application/json',Authorization:'Bearer '+token}});if(!r.ok())throw Error(method+' '+route+' '+r.status());return r.json()}
try{
 await artisan('cache:clear')
 const staff=await context(),page=staff.page
 await page.goto(base+'/loyalty/login');await page.getByLabel('Email',{exact:true}).fill(fixture.roles.manager.email);await page.getByLabel('Password',{exact:true}).fill(fixture.roles.manager.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'))
 const token=await page.evaluate(()=>localStorage.getItem('auth_token'))
 const members=[]
 for(const suffix of ['Ada','Grace']){const m=await context(),name=`Voucher ${suffix} ${run}`;await m.page.goto(base+'/portal/join?org='+fixture.org_token);await m.page.getByLabel('Your name',{exact:true}).fill(name);await m.page.getByLabel('Email',{exact:true}).fill(`${suffix.toLowerCase()}.${run}@example.test`);await m.page.getByLabel(/^Password/).fill(fixture.member.password);await m.page.getByLabel('Confirm password',{exact:true}).fill(fixture.member.password);await m.page.getByRole('button',{name:'Create my membership',exact:true}).click();await m.page.waitForURL(u=>u.pathname==='/portal');m.token=await m.page.evaluate(()=>localStorage.getItem('auth_token'));m.name=name;const b=await api(staff.ctx,token,'admin/loyalty/find?brand_id=all&q='+encodeURIComponent(name));m.id=b.members.find(x=>x.name===name)?.id;members.push(m)}
 const [ada,grace]=members
 await api(ada.ctx,ada.token,'member/profile','PUT',{marketing_consent:true,email_notifications:true})
 check(ada.id!==grace.id,'Two independent member sessions enrolled through the real portal')
 await page.goto(base+'/loyalty/rewards?tab=offers&offer=new');let dialog=page.getByRole('dialog');await dialog.getByLabel('Offer name',{exact:true}).fill('Christmas voucher '+run);await dialog.getByLabel('Kind',{exact:true}).selectOption('discount');await dialog.getByLabel('Value',{exact:true}).fill('10');await dialog.getByLabel('Description',{exact:true}).fill('A Christmas gift for you.');await dialog.getByRole('radio',{name:'Selected members only',exact:true}).check();await dialog.getByLabel('Find members',{exact:true}).pressSequentially(ada.name,{delay:20});await dialog.getByRole('button',{name:'Select',exact:true}).click();await dialog.getByLabel('Find members',{exact:true}).press('Enter');check(await dialog.isVisible(),'Enter in member search keeps the offer editor open');await dialog.getByRole('button',{name:'+ Create offer',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const offers=await api(staff.ctx,token,'admin/loyalty/offers?brand_id=all'),offer=offers.offers.find(o=>o.title==='Christmas voucher '+run)
 check(offer.audience==='members'&&offer.member_ids.length===1&&offer.member_ids[0]===ada.id,'Editor saves exactly one individually selected recipient')
 const pdf=Buffer.from('%PDF-1.4\nChristmas voucher\n%%EOF')
 await page.locator('#management-detail input[type=file]').setInputFiles({name:'Christmas-voucher.pdf',mimeType:'application/pdf',buffer:pdf});await page.locator('#management-detail').getByText('Christmas-voucher.pdf',{exact:true}).waitFor()
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Offer directory has no horizontal overflow');await page.locator('#management-detail').getByRole('button',{name:'Send to members',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Review recipients',exact:true}).click();await dialog.getByRole('button',{name:'Send email & portal message',exact:true}).waitFor();await page.screenshot({path:path.join(out,'send-desktop.png'),fullPage:true});await dialog.getByRole('button',{name:'Send email & portal message',exact:true}).click();await dialog.getByText(/portal messages are ready/).waitFor();await dialog.getByRole('button',{name:'Done',exact:true}).click()
 check(true,'PDF uploaded and confirmed email plus portal send completed through the popup')
 await artisan('queue:work','database','--stop-when-empty','--max-jobs=20','--sleep=0','--tries=1','--timeout=30')
 const inbox=await api(ada.ctx,ada.token,'member/notifications'),otherInbox=await api(grace.ctx,grace.token,'member/notifications')
 check(inbox.data.filter(n=>n.data?.offer_id===offer.id).length===1&&!otherInbox.data.some(n=>n.data?.offer_id===offer.id),'Only the chosen member gets one offer message')
 const actual=await ada.ctx.request.get(base+`/api/v1/member/portal/offers/${offer.id}/attachment`,{headers:{Authorization:'Bearer '+ada.token}})
 check(actual.ok()&&Buffer.compare(await actual.body(),pdf)===0,'Recipient downloads exact original PDF bytes')
 const denied=await grace.ctx.request.get(base+`/api/v1/member/portal/offers/${offer.id}/attachment`,{headers:{Accept:'application/json',Authorization:'Bearer '+grace.token}})
 check(denied.status()===404,'Unselected member cannot download a guessed private attachment')
 await ada.page.goto(base+'/portal/rewards');await ada.page.getByRole('button',{name:'Download voucher',exact:true}).waitFor();await ada.page.screenshot({path:path.join(out,'portal-desktop.png'),fullPage:true})
 await ada.page.goto(base+'/portal/inbox');await ada.page.getByRole('button').filter({hasText:offer.title}).click();await ada.page.getByRole('button',{name:'Download voucher',exact:true}).waitFor();check(true,'Voucher downloads are present in member Rewards and expanded Inbox')
 for(const lang of ['en','de','es','fr','ru'])for(const theme of ['dark','light'])for(const width of [390,1440]){await artisan('cache:clear');await page.evaluate(({lang,theme})=>{localStorage.setItem('admin_lang',lang);localStorage.setItem('loyalty:look',JSON.stringify({theme,rail:'full'}))},{lang,theme});await page.setViewportSize({width,height:1000});await page.goto(base+`/loyalty/rewards?tab=offers&selected=${offer.id}&edit=1`);await page.getByRole('dialog').waitFor();await page.waitForTimeout(160);const words=JSON.parse(await fs.readFile(new URL(`../src/loyalty/i18n/personal.${lang}.json`,import.meta.url),'utf8'));check(await page.getByRole('dialog').getByText(words.audience,{exact:true}).count()===1,`${lang} recipient controls translated`);check(await page.getByRole('dialog').locator('input[type=search]').evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft)>=34),'Search text clears its icon');const bad=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2||[...document.querySelectorAll('[role=dialog]')].some(e=>e.scrollWidth>e.clientWidth+2));check(!bad,`${lang} ${theme} ${width}px editor fits`);if(width===390&&lang==='de')await page.screenshot({path:path.join(out,`editor-${lang}-${theme}-${width}.png`),fullPage:true})}
 check(report.errors.length===0,'No browser runtime errors')
}catch(e){report.failure=String(e.message);console.error(report.failure);process.exitCode=1}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close()}
