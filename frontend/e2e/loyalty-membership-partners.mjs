import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright'

const base=process.env.LAUNCH_BASE || 'http://127.0.0.1:5820'
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname) || process.env.DB_DATABASE!=='loyalty_launch_demo'
 || process.env.DB_HOST!=='127.0.0.1' || process.env.DB_PORT!=='55459' || process.env.MAIL_MAILER!=='log') throw Error('Isolated launch environment required')
const root=fileURLToPath(new URL('../../',import.meta.url)), exec=promisify(execFile)
await exec(process.env.PHP,[fileURLToPath(new URL('./launch-artisan.php',import.meta.url)),'cache:clear','--no-interaction'],{cwd:root,env:process.env,windowsHide:true,timeout:60000})
const fixture=JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE,'utf8')), run=Date.now().toString(36)
const secrets=Object.values(fixture.roles).map(x=>x.password)
const scrub=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value))
const out=path.resolve(process.env.LAUNCH_OUTPUT,'../memberships'), report={checks:[],errors:[],phase:'start',localOnly:true}
await fs.mkdir(out,{recursive:true})
const check=(ok,name)=>{if(!ok)throw Error(name);report.checks.push(name);console.log('PASS '+name)}
const browser=await chromium.launch({channel:'chrome',headless:true})
let current
const contexts=[]
async function context(){
 const ctx=await browser.newContext({viewport:{width:1440,height:1080}});contexts.push(ctx)
 await ctx.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort())
 await ctx.addInitScript(()=>{if(!localStorage.getItem('admin_lang'))localStorage.setItem('admin_lang','en');if(!localStorage.getItem('loyalty:look'))localStorage.setItem('loyalty:look',JSON.stringify({theme:'dark',rail:'full'}))})
 const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(scrub(e.message)));current=page
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('PAGE '+new URL(frame.url()).pathname)})
 return {ctx,page}
}
async function call(ctx,token,endpoint,method='GET',data){
 const response=await ctx.request.fetch(base+'/api/v1/'+endpoint+(endpoint.includes('?')?'&':'?')+'brand_id=all',{method,data,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})}})
 return {status:response.status(),data:await response.json()}
}
async function login(page,email,password){
 await page.goto(base+'/loyalty/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(url=>!url.pathname.endsWith('/login'))
 return page.evaluate(()=>localStorage.getItem('auth_token'))
}
async function invitation(email){
 await exec(process.env.PHP,[fileURLToPath(new URL('./membership-invitation-fixture.php',import.meta.url))],{cwd:root,env:{...process.env,CLAIM_TEST_EMAIL:email},windowsHide:true,timeout:60000})
 const file=path.join(path.dirname(process.env.LAUNCH_FIXTURE),'membership-invitation-private.json'), data=JSON.parse(await fs.readFile(file,'utf8'));await fs.unlink(file);return data
}
try {
 const manager=await context(), token=await login(manager.page,fixture.roles.manager.email,fixture.roles.manager.password)
 const boot=(await call(manager.ctx,token,'admin/loyalty/bootstrap')).data, tiers=boot.programme.tiers.filter(x=>x.is_active), tier=tiers.at(-1)
 check(Boolean(tier),'Real backend supplies membership levels')
 const benefitName='Partner service '+run
 const benefit=(await call(manager.ctx,token,'admin/loyalty/program/benefits','POST',{name:benefitName,code:'PARTNER_'+run.toUpperCase(),category:'other',fulfillment_mode:'automatic',is_active:true})).data.benefit
 check(Boolean(benefit?.id),'Manager configures a real package benefit')
 check((await call(manager.ctx,token,`admin/loyalty/program/tiers/${tier.id}/benefits`,'POST',{benefit_id:benefit.id,value:'10% service discount',value_type:'percent_discount',value_amount:10,applies_to:'services'})).status===200,'Benefit is attached to the assigned package')
 const today=boot.venue.today, end=today.slice(0,4)*1+1+today.slice(4), tomorrow=new Date(Date.UTC(...today.split('-').map((v,i)=>Number(v)-(i===1?1:0)))+86400000).toISOString().slice(0,10)
 report.phase='create member'
 await manager.page.goto(base+'/loyalty');await manager.page.getByRole('button',{name:'Add member',exact:true}).click()
 const dialog=manager.page.getByRole('dialog');await dialog.getByLabel('Name',{exact:true}).fill('Membership Journey '+run)
 const memberEmail=`membership.member.${run}@example.test`;await dialog.getByLabel('Email',{exact:true}).fill(memberEmail)
 await dialog.getByLabel('How the level is set',{exact:true}).selectOption('assigned')
 await dialog.getByLabel('Membership package / level',{exact:true}).selectOption(String(tier.id))
 await dialog.getByLabel('Valid from (optional)',{exact:true}).fill(today)
 await dialog.getByLabel('Valid until (optional)',{exact:true}).fill(end)
 await dialog.getByLabel('Send the welcome email',{exact:true}).uncheck()
 await dialog.locator('[data-assignment-benefits]').getByText(benefitName,{exact:false}).waitFor()
 check((await dialog.locator('[data-assignment-benefits]').innerText()).includes('10% service discount'),'Assignment form previews the actual package benefit')
 await manager.page.screenshot({path:path.join(out,'assignment-desktop.png'),fullPage:true})
 const created=manager.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/loyalty/members'))
 await dialog.getByRole('button',{name:'Add member',exact:true}).click();const enrolled=await (await created).json(), member=enrolled.member
 check(member?.membership_mode==='assigned'&&member.tier_id===tier.id&&member.valid_from===today&&member.valid_until===end,'Actual add-member form saves package and dates in one request')
 await dialog.waitFor({state:'hidden'});await manager.page.goto(base+`/loyalty/members/${member.id}`)
 await manager.page.getByRole('button',{name:'Manage membership',exact:true}).waitFor()
 check((await manager.page.locator('main').innerText()).includes('Manually assigned'),'Member page identifies the manual package')
 await manager.page.getByRole('button',{name:'Manage membership',exact:true}).click();await dialog.getByLabel('Valid from (optional)',{exact:true}).fill(tomorrow)
 await dialog.getByRole('button',{name:'Save membership',exact:true}).click()
 check(await dialog.isVisible(),'Future replacement waits for explicit confirmation')
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Save membership',exact:true}).click();await dialog.waitFor({state:'hidden'})
 check((await call(manager.ctx,token,`admin/loyalty/members/${member.id}`)).data.member.membership_state==='scheduled','Future assignment is scheduled in the real database')
 report.phase='invite partner'
 const place=(await call(manager.ctx,token,'admin/loyalty/places','POST',{name:'Partner journey '+run,admits:'all',is_active:true})).data.place
 check(Boolean(place?.id),'Manager creates a real partner place')
 await manager.page.goto(base+'/loyalty/partners');await manager.page.getByRole('button',{name:'Invite partner staff',exact:true}).click()
 const partnerEmail=`membership.partner.${run}@example.test`
 await dialog.getByLabel('Name',{exact:true}).fill('Partner Journey '+run);await dialog.getByLabel('Email',{exact:true}).fill(partnerEmail)
 await dialog.getByLabel(place.name,{exact:true}).check()
 const invited=manager.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/partners/invite'))
 await dialog.getByRole('button',{name:'Send invitation',exact:true}).click();const invitedResponse=await invited
 check(invitedResponse.ok(),'Partner invitation saves through the real Team writer with local captured mail')
 const partnerId=(await invitedResponse.json()).staff_id;await dialog.waitFor({state:'hidden'})
 await manager.page.screenshot({path:path.join(out,'partners-desktop.png'),fullPage:true})
 const partner=await context(), invite=await invitation(partnerEmail), password=randomBytes(24).toString('hex')
 secrets.push(invite.code,password)
 await partner.page.goto(base+'/activate?email='+encodeURIComponent(invite.email)+'&code='+encodeURIComponent(invite.code))
 await partner.page.locator('input[type=password]').nth(0).fill(password);await partner.page.locator('input[type=password]').nth(1).fill(password)
 await partner.page.getByRole('button',{name:/Activate|Set password/}).click();await partner.page.waitForURL('**/loyalty/partner')
 check(true,'Email activation lands the partner directly in their restricted scanner')
 await partner.page.locator('.l-partner-controls').waitFor()
 const partnerToken=await partner.page.evaluate(()=>localStorage.getItem('auth_token'))
 for(const [method,endpoint,data] of [['GET','members'],['GET','bootstrap'],['POST','scan',{code:member.member_number}],['PUT',`members/${member.id}/membership`,{membership_mode:'earned',idempotency_key:run}]]){
  check((await call(partner.ctx,partnerToken,'admin/loyalty/'+endpoint,method,data)).status===403,'Partner cannot call '+method+' '+endpoint)
 }
 await partner.page.getByLabel('Member QR or card code',{exact:true}).fill(member.member_number)
 await partner.page.getByRole('button',{name:'Scan and check in',exact:true}).click();await partner.page.locator('.l-partner-result').waitFor()
 check(await partner.page.locator('.l-partner-result').getAttribute('data-granted')==='false','Partner scanner refuses a future membership')
 check((await partner.page.locator('.l-partner-result').innerText()).includes('Valid from'),'Denied result explains the membership start')
 await call(manager.ctx,token,`admin/loyalty/members/${member.id}/membership`,'PUT',{membership_mode:'assigned',tier_id:tier.id,valid_from:today,valid_until:end,idempotency_key:'start-'+run})
 await partner.page.getByRole('button',{name:'Scan next member',exact:true}).click();await partner.page.getByLabel('Member QR or card code',{exact:true}).fill(member.member_number)
 await partner.page.getByRole('button',{name:'Scan and check in',exact:true}).click();await partner.page.locator('.l-partner-result[data-granted=true]').waitFor()
 check((await partner.page.locator('.l-partner-result').innerText()).includes(tier.name),'Partner sees the assigned level on a successful check-in')
 check((await partner.page.locator('.l-partner-benefits').innerText()).includes(benefitName),'Partner sees the actual configured package benefit')
 check(await partner.page.locator('a[href*="members/"]').count()===0,'Restricted screen has no member editing links')
 await partner.page.screenshot({path:path.join(out,'partner-scan-desktop.png'),fullPage:true})
 for(const locale of ['en','ru','de','fr','es'])for(const theme of ['dark','light']){
  const words=JSON.parse(await fs.readFile(new URL('../src/loyalty/i18n/membership.'+locale+'.json',import.meta.url),'utf8'))
  await partner.page.evaluate(({locale,theme})=>{localStorage.setItem('admin_lang',locale);localStorage.setItem('loyalty:look',JSON.stringify({theme,rail:'full'}))},{locale,theme})
  await partner.page.setViewportSize({width:390,height:844});await partner.page.reload();await partner.page.locator('.l-partner-controls').waitFor()
  check(await partner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),locale+' '+theme+': partner scanner fits a phone')
  check(!(await partner.page.locator('main').innerText()).includes('loyalty.membership.'),locale+' '+theme+': scanner translations resolve')
  check(await partner.page.getByRole('heading',{level:1}).innerText()===words.partners.app,locale+' '+theme+': requested language is actually displayed')
  check(await partner.page.locator('[data-loyalty]').getAttribute('data-theme')===theme,locale+' '+theme+': requested theme is actually displayed')
 }
 await partner.page.screenshot({path:path.join(out,'partner-scan-mobile.png'),fullPage:true})
 report.phase='card reuse'
 const uid=randomBytes(7).toString('hex'), card=(await call(manager.ctx,token,`admin/loyalty/members/${member.id}/cards`,'POST',{uid})).data.card
 const qr=(await call(manager.ctx,token,`admin/loyalty/members/${member.id}/cards/${card.id}/qr`)).data
 check(qr.code==='HTCARD:'+uid&&qr.qr_svg.startsWith('data:image/svg+xml;base64,'),'Reusable card QR encodes its explicit physical ID')
 const next=(await call(manager.ctx,token,'admin/loyalty/members','POST',{name:'Next member '+run,email:`membership.next.${run}@example.test`,send_welcome:false})).data.member
 await call(manager.ctx,token,`admin/loyalty/members/${member.id}/cards/${card.id}/off`,'POST')
 const linked=await call(manager.ctx,token,`admin/loyalty/members/${next.id}/cards`,'POST',{uid})
 check(linked.status===201&&linked.data.card.id===card.id,'Returned physical card is reused on the same row')
 check((await call(manager.ctx,token,`admin/loyalty/members/${next.id}/cards/${card.id}/qr`)).data.qr_svg===qr.qr_svg,'Printed card QR remains unchanged after reassignment')
 check((await call(partner.ctx,partnerToken,'admin/loyalty/partner/scan','POST',{code:qr.code,place_id:place.id,idempotency_key:'card-'+run})).data.member.id===next.id,'Partner scan resolves the reassigned card to the new member')
 await partner.page.evaluate(()=>localStorage.setItem('admin_lang','en'));await partner.page.reload();await partner.page.getByRole('button',{name:'Physical card ID',exact:true}).click()
 await partner.page.getByLabel('Physical card ID', {exact:true}).fill(uid)
 const manual=partner.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/admin/loyalty/partner/scan')&&r.request().method()==='POST')
 await partner.page.getByRole('button',{name:'Scan and check in',exact:true}).click()
 const manualResponse=await manual
 check(manualResponse.request().postDataJSON().code===qr.code&&(await manualResponse.json()).member.id===next.id,'Physical card reader mode sends explicit identity and resolves the new holder')
 await partner.page.evaluate(()=>{window.NDEFReader=class extends EventTarget{async scan(){window.__membershipNfc=this}}})
 await partner.page.getByRole('button',{name:'Tap NFC card',exact:true}).click()
 await partner.page.waitForFunction(()=>!!window.__membershipNfc)
 const tapped=partner.page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/admin/loyalty/partner/scan')&&r.request().method()==='POST')
 await partner.page.evaluate(({uid,number})=>{const data=new TextEncoder().encode(JSON.stringify({member_number:number,v:2}));window.__membershipNfc.onreading({serialNumber:uid,message:{records:[{recordType:'text',data:new DataView(data.buffer)}]}})},{uid,number:member.member_number})
 const tappedResponse=await tapped
 check(tappedResponse.request().postDataJSON().code===qr.code&&(await tappedResponse.json()).member.id===next.id,'Simulated NFC prioritises the registered physical serial over the former member record')
 await call(manager.ctx,token,`admin/loyalty/partners/${partnerId}/state`,'PUT',{is_active:false})
 check((await call(partner.ctx,partnerToken,'admin/loyalty/partner/scan','POST',{code:qr.code,place_id:place.id,idempotency_key:'card-'+run})).status===403,'Deactivation blocks even an earlier successful retry')
 report.phase='menu'
 await manager.page.goto(base+'/loyalty/overview');await manager.page.getByRole('button',{name:'Collapse menu',exact:true}).click()
 check(await manager.page.locator('[data-loyalty]').getAttribute('data-slim')!==null,'Visible menu icon collapses the rail')
 await manager.page.reload();await manager.page.getByRole('button',{name:'Expand menu',exact:true}).waitFor();check(await manager.page.locator('[data-loyalty]').getAttribute('data-slim')!==null,'Collapsed menu persists and keeps its expand icon')
 await manager.page.getByRole('button',{name:'Expand menu',exact:true}).click()
 check(report.errors.length===0,'Journey has no browser runtime errors')
 report.phase='complete';await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('Checks: '+report.checks.length)
}catch(error){
 report.failure=scrub(error.message);report.url=current?new URL(current.url()).pathname:null;report.visible=current?scrub((await current.locator('body').innerText()).slice(0,2000)):null;await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));if(current)await current.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{})
 console.error('FAILED '+report.phase+': '+report.failure);process.exitCode=1
}finally{for(const ctx of contexts)await ctx.close();await browser.close()}
