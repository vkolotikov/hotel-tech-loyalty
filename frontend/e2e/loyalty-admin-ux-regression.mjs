import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
const base=process.env.LAUNCH_BASE||'http://127.0.0.1:5819'
if(new URL(base).hostname!=='127.0.0.1'||process.env.DB_DATABASE!=='loyalty_launch_demo'||process.env.DB_PORT!=='55459'||process.env.MAIL_MAILER!=='log')throw Error('Isolated launch environment required')
const fixture=JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE,'utf8')),out=path.resolve(process.env.LAUNCH_OUTPUT,'../admin-ux-regression')
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage()
await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort())
await page.addInitScript(()=>{localStorage.setItem('admin_lang','en');localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}))})
const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label)}
try{
 await page.goto(base+'/loyalty/login');await page.getByLabel('Email',{exact:true}).fill(fixture.roles.manager.email);await page.getByLabel('Password',{exact:true}).fill(fixture.roles.manager.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(u=>!u.pathname.endsWith('/login'))
 const token=await page.evaluate(()=>localStorage.getItem('auth_token')),headers={Authorization:'Bearer '+token,Accept:'application/json'}
 const api=async(endpoint,method='GET',data)=>{const r=await ctx.request.fetch(base+'/api/v1/admin/loyalty/'+endpoint+'?brand_id=all',{method,headers,data});if(!r.ok())throw Error('Test API '+endpoint+' status '+r.status());return r.json()}
 const program=await api('program'),benefit=program.benefits.find(b=>b.name.startsWith('Service discount ')),tier=program.tiers.find(t=>t.benefits.some(b=>b.benefit_id===benefit?.id))
 if(!benefit||!tier)throw Error('Run the administration journey fixture first')
 await page.goto(`${base}/loyalty/rewards?tab=benefits&selected=${benefit.id}&level=${tier.id}`)
 await page.locator('#management-detail').getByRole('button',{name:/Manage.*assignment/}).click()
 let dialog=page.getByRole('dialog');const wording='Unsaved assignment cancellation regression';await dialog.locator('textarea').fill(wording)
 await dialog.getByRole('button',{name:'Take it off',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Keep it',exact:true}).click()
 dialog=page.getByRole('dialog');check(await dialog.locator('textarea').inputValue()===wording,'Cancelling assignment removal preserves the unsaved wording')
 const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(`/tiers/${tier.id}/benefits`));await dialog.getByRole('button',{name:'Save benefit',exact:true}).click();check((await response).ok(),'The shared editor saves through the canonical assignment endpoint')
 check((await api('program')).tiers.find(t=>t.id===tier.id).benefits.find(b=>b.benefit_id===benefit.id).value===wording,'Saved assignment wording reaches the real program record')
 await page.screenshot({path:path.join(out,'assignment-after-save.png'),fullPage:true})
}catch(e){console.error(String(e.message));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1}finally{await fs.writeFile(path.join(out,'result.json'),JSON.stringify({checks},null,2));await browser.close()}
