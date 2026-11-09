import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright'

// Real local backend only. The seed fixture and its generated credentials stay outside the repository.
const base = process.env.LAUNCH_BASE || 'http://127.0.0.1:5819'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Local launch rehearsal required')
if (!process.env.LAUNCH_FIXTURE) throw Error('LAUNCH_FIXTURE must name the isolated seed fixture')
if (!process.env.LAUNCH_CLOCK_FILE) throw Error('LAUNCH_CLOCK_FILE must control the isolated backend clock')
if (process.env.DB_DATABASE !== 'loyalty_launch_demo' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '55459' || process.env.MAIL_MAILER !== 'log' || process.env.QUEUE_CONNECTION !== 'database') throw Error('The isolated database, captured mail and database queue environment are required')
await fs.writeFile(process.env.LAUNCH_CLOCK_FILE, '2026-11-09T10:00:00Z')
const fixture = JSON.parse(await fs.readFile(process.env.LAUNCH_FIXTURE, 'utf8'))
const out = path.resolve(process.env.LAUNCH_OUTPUT || 'test-results/launch-journey')
await fs.mkdir(out, { recursive: true })
const secrets = [...Object.values(fixture.roles).map(x => x.password), fixture.member.password]
const scrub = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value))
const run = Date.now().toString(36)
const member = { ...fixture.member, email: `launch.member.${run}@example.test`, name: `Launch Member ${run}` }
const result = { checks: [], errors: [], serverErrors: [], phase: 'start', localOnly: true }
const check = (condition, name) => { if (!condition) throw Error(name); result.checks.push(name); console.log('PASS ' + name) }
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || 'chrome', headless: true })
const exec = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
async function artisan(...args) {
  try {
    return await exec(process.env.PHP || 'php8.5', [fileURLToPath(new URL('./launch-artisan.php', import.meta.url)), ...args, '--no-interaction'], { cwd: root, env: process.env, timeout: 60000, windowsHide: true })
  } catch (error) { throw Error('Isolated artisan command failed: ' + args[0] + ' (' + (error.code || 'timeout') + ')') }
}
async function worker() { await artisan('queue:work', 'database', '--stop-when-empty', '--max-jobs=50', '--sleep=0', '--tries=1', '--timeout=30') }
const contexts = []
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  contexts.push(ctx)
  await ctx.addInitScript(() => { localStorage.setItem('admin_lang', 'en'); localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' })) })
  await ctx.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const page = await ctx.newPage()
  page.on('pageerror', error => result.errors.push(scrub(error.message)))
  page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(base + '/api/')) result.serverErrors.push({ path: new URL(response.url()).pathname, status: response.status() }) })
  return { ctx, page }
}
async function api(ctx, token, endpoint, method = 'GET', data) {
  const url = new URL('/api/v1/' + endpoint, base)
  if (endpoint.startsWith('admin/loyalty/')) url.searchParams.set('brand_id', 'all')
  const response = await ctx.request.fetch(url.toString(), { method, headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }, ...(data === undefined ? {} : { data }) })
  const body = await response.json().catch(() => ({}))
  return { status: response.status(), body }
}
async function login(ctx, role) {
  const response = await ctx.request.post(base + '/api/v1/auth/login', { data: { ...fixture.roles[role], user_type: 'staff' }, headers: { Accept: 'application/json' } })
  const body = await response.json()
  check(response.ok() && !!body.token, role + ' API authentication')
  return body.token
}
let managerPage, memberPage
try {
  await artisan('cache:clear')
  result.phase = 'manager UI sign-in'
  const managerSession = await context(); managerPage = managerSession.page
  await managerPage.goto(base + '/loyalty/login')
  await managerPage.getByLabel('Email', { exact: true }).fill(fixture.roles.manager.email)
  await managerPage.getByLabel('Password', { exact: true }).fill(fixture.roles.manager.password)
  await managerPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await managerPage.waitForURL(url => url.pathname === '/loyalty', { timeout: 20000 })
  await managerPage.locator('h1').waitFor()
  const managerToken = await managerPage.evaluate(() => localStorage.getItem('auth_token'))
  const boot = await api(managerSession.ctx, managerToken, 'admin/loyalty/bootstrap')
  check(boot.status === 200 && boot.body.organization.name === 'Launch Test Hotel', 'manager signs in to the isolated hotel through the real UI')
  check(boot.body.staff.can.manage_program && boot.body.staff.can.manage_members, 'manager capabilities come from the server')

  result.phase = 'member public registration'
  const memberSession = await context(); memberPage = memberSession.page
  await memberPage.goto(base + '/portal/join?org=' + encodeURIComponent(fixture.org_token))
  await memberPage.getByLabel('Your name', { exact: true }).fill(member.name)
  await memberPage.getByLabel('Email', { exact: true }).fill(member.email)
  await memberPage.getByLabel(/^Password/).fill(member.password)
  await memberPage.getByLabel('Confirm password', { exact: true }).fill(member.password)
  await memberPage.getByRole('button', { name: 'Create my membership', exact: true }).click()
  await memberPage.waitForURL(url => url.pathname === '/portal', { timeout: 20000 })
  const memberToken = await memberPage.evaluate(() => localStorage.getItem('auth_token'))
  const initial = await api(memberSession.ctx, memberToken, 'member/portal')
  check(initial.status === 200 && initial.body.venue.name === 'Launch Test Hotel', 'member registers and reaches their own venue portal')
  result.phase = 'member avatar upload'
  const avatar = await memberSession.ctx.request.post(base + '/api/v1/member/profile/avatar', {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + memberToken },
    multipart: { avatar: { name: 'launch-avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZioAAAAASUVORK5CYII=', 'base64') } },
  })
  const avatarBody = await avatar.json()
  check(avatar.ok() && /^\/storage\/org-\d+\/avatars\/user-\d+\//.test(avatarBody.avatar_url), 'member avatar uses the shared tenant-owned media writer')
  const profileWithAvatar = await api(memberSession.ctx, memberToken, 'member/profile')
  const avatarFile = await memberSession.ctx.request.get(base + avatarBody.avatar_url)
  check(profileWithAvatar.body.user.avatar_url === avatarBody.avatar_url && avatarFile.ok() && avatarFile.headers()['content-type']?.includes('image/png'), 'saved member avatar and its actual image remain available on a subsequent request')
  result.phase = 'member public registration'
  const initialPoints = initial.body.member.current_points
  check(Number.isInteger(initialPoints) && initialPoints >= 0, 'registration starts with the server-defined welcome balance')
  const nextTier = initial.body.member.progress.next_tier
  const awardPoints = Math.max(750, (initial.body.member.progress.points_needed || 0) + 250)
  const earnedPoints = initialPoints + awardPoints
  const listed = await api(managerSession.ctx, managerToken, 'admin/loyalty/members?q=' + encodeURIComponent(member.email))
  const enrolled = listed.body.members.find(row => row.name === member.name)
  check(!!enrolled, 'the same registered member appears in the staff directory')
  result.memberId = enrolled.id
  fixture.last_member_email = member.email
  await fs.writeFile(process.env.LAUNCH_FIXTURE, JSON.stringify(fixture))

  result.phase = 'staff award and member balance refresh'
  await managerPage.goto(base + '/loyalty/members/' + enrolled.id)
  await managerPage.getByRole('button', { name: 'Award points', exact: true }).click()
  await managerPage.getByRole('spinbutton', { name: 'Points to add' }).fill(String(awardPoints))
  await managerPage.getByRole('textbox', { name: 'Reason', exact: true }).fill('Launch journey visit')
  const awardResponse = managerPage.waitForResponse(response => response.url().includes('/award') && response.request().method() === 'POST')
  await managerPage.getByRole('dialog').getByRole('button', { name: /^Award [\d,]+ points$/ }).click()
  const award = await awardResponse
  const awardBody = await award.json()
  check(award.ok(), 'staff awards points through the real member profile')
  const awardRetry = await api(managerSession.ctx, managerToken, `admin/loyalty/members/${enrolled.id}/award`, 'POST', award.request().postDataJSON())
  check(awardRetry.status === 200 && awardRetry.body.member.points === earnedPoints, 'retrying the same staff award cannot credit points twice')
  await memberPage.reload()
  const earned = await api(memberSession.ctx, memberToken, 'member/portal')
  check(earned.body.member.current_points === earnedPoints, 'member immediately sees the staff award in the real ledger')
  check(earned.body.member.lifetime_points === earnedPoints && !!earned.body.member.tier, 'earned totals and membership level are supplied by the server')
  check(!!nextTier && earned.body.member.tier.id === nextTier.id, 'earning the server-defined requirement upgrades the member’s actual level')
  await managerPage.screenshot({ path: path.join(out, 'staff-member-desktop.png'), fullPage: false })
  await memberPage.screenshot({ path: path.join(out, 'member-home-desktop.png'), fullPage: false })

  result.phase = 'catalogue setup'
  const created = await api(managerSession.ctx, managerToken, 'admin/loyalty/rewards', 'POST', { name: 'Launch coffee ' + run, description: 'Controlled local launch reward.', points_cost: 200, stock: 5, per_member_limit: 2, is_active: true, discount_type: 'fixed_amount', discount_value: 4, applies_to: 'all' })
  check(created.status === 201, 'manager creates a real reward through the existing writer')
  result.rewardId = created.body.reward.id
  await memberPage.goto(base + '/portal/rewards?tab=catalogue')
  await memberPage.getByText('Launch coffee ' + run, { exact: true }).waitFor()
  const rewardCard = memberPage.getByRole('heading', { name: 'Launch coffee ' + run, exact: true }).locator('..').locator('..').locator('..')
  await rewardCard.getByRole('button', { name: 'Redeem', exact: true }).click()
  const redeemResponse = memberPage.waitForResponse(response => response.url().includes(`/member/rewards/${created.body.reward.id}/redeem`) && response.request().method() === 'POST')
  await memberPage.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  const redemption = await redeemResponse
  const redemptionBody = await redemption.json()
  check(redemption.status() === 201 && !!redemptionBody.redemption.code, 'member redeems a reward through the real confirmation window')
  const afterClaim = await api(memberSession.ctx, memberToken, 'member/portal')
  check(afterClaim.body.member.current_points === earnedPoints - 200, 'redemption deducts the exact reward cost')
  check(afterClaim.body.member.lifetime_points === earnedPoints, 'spending preserves earned totals')
  const claimedId = redemptionBody.redemption.id
  const inbox = await api(managerSession.ctx, managerToken, 'admin/loyalty/requests/inbox')
  const claimedRow = inbox.body.records.find(row => row.kind === 'redemption' && row.id === claimedId)
  check(!!claimedRow, 'the member reward reaches the real staff inbox')
  await managerPage.goto(base + '/loyalty/requests?record=' + encodeURIComponent(claimedRow.key))
  await managerPage.locator('.l-rq-actions .l-ov-primary').click()
  const fulfilResponse = managerPage.waitForResponse(response => response.url().includes(`/redemptions/${claimedId}/fulfil`) && response.request().method() === 'POST')
  await managerPage.getByRole('dialog').locator('.l-ov-primary').click()
  check((await fulfilResponse).ok(), 'staff fulfils the reward through the real inbox review')
  const myCodes = await api(memberSession.ctx, memberToken, 'member/my/redemptions')
  check(myCodes.body.redemptions.some(row => row.id === claimedId && row.status === 'fulfilled'), 'member reward history reflects staff fulfilment')
  const fulfilRetry = await api(managerSession.ctx, managerToken, `admin/loyalty/redemptions/${claimedId}/fulfil`, 'POST')
  check(fulfilRetry.status < 500 && (await api(memberSession.ctx, memberToken, 'member/portal')).body.member.current_points === earnedPoints - 200, 'repeated fulfilment cannot deduct points again')

  result.phase = 'benefit request and fulfilment'
  const benefitName = 'Launch late checkout ' + run
  const definition = await api(managerSession.ctx, managerToken, 'admin/loyalty/program/benefits', 'POST', { name: benefitName, code: 'launch_checkout_' + run, category: 'accommodation', fulfillment_mode: 'on_request', is_active: true })
  check(definition.status === 201, 'manager creates a requestable benefit through the existing catalogue')
  const assignment = await api(managerSession.ctx, managerToken, `admin/loyalty/program/tiers/${earned.body.member.tier.id}/benefits`, 'POST', { benefit_id: definition.body.benefit.id, value_type: 'text', value: 'Until 14:00', applies_to: 'all', is_active: true })
  check(assignment.status === 200, 'manager assigns that benefit to the member’s actual level')
  await memberPage.goto(base + '/portal/rewards?tab=benefits')
  const benefitCard = memberPage.getByRole('heading', { name: benefitName, exact: true }).locator('..').locator('..').locator('..')
  await benefitCard.getByRole('button', { name: 'Request this', exact: true }).click()
  await memberPage.getByText('Requested — the venue will confirm', { exact: true }).waitFor()
  const benefits = await api(memberSession.ctx, memberToken, 'member/benefits')
  const requested = benefits.body.benefits.find(row => row.name === benefitName)
  check(!!requested?.request?.id, 'member benefit request is persisted by the real server')
  const benefitInbox = await api(managerSession.ctx, managerToken, 'admin/loyalty/requests/inbox')
  const benefitRow = benefitInbox.body.records.find(row => row.kind === 'benefit' && row.id === requested.request.id)
  check(!!benefitRow, 'benefit request reaches the same staff inbox')
  await managerPage.goto(base + '/loyalty/requests?record=' + encodeURIComponent(benefitRow.key))
  await managerPage.locator('.l-rq-actions .l-ov-primary').click()
  const approveResponse = managerPage.waitForResponse(response => response.url().includes(`/requests/${requested.request.id}/approve`) && response.request().method() === 'POST')
  await managerPage.getByRole('dialog').locator('.l-ov-primary').click()
  check((await approveResponse).ok(), 'staff approves the member benefit in the real inbox')
  await managerPage.reload()
  await managerPage.locator('.l-rq-actions .l-ov-primary').click()
  const doneResponse = managerPage.waitForResponse(response => response.url().includes(`/requests/${requested.request.id}/done`) && response.request().method() === 'POST')
  await managerPage.getByRole('dialog').locator('.l-ov-primary').click()
  check((await doneResponse).ok(), 'staff completes the approved benefit in the real inbox')
  const completedBenefits = await api(memberSession.ctx, memberToken, 'member/benefits')
  check(!!completedBenefits.body.benefits.find(row => row.name === benefitName)?.last_fulfilled_at, 'member benefits reflect completed fulfilment')
  check((await api(memberSession.ctx, memberToken, 'member/portal')).body.member.current_points === earnedPoints - 200, 'benefit fulfilment does not change the points balance')

  result.phase = 'permissions and account state'
  const reader = await login(managerSession.ctx, 'reader')
  const refusedAward = await api(managerSession.ctx, reader, `admin/loyalty/members/${enrolled.id}/award`, 'POST', { points: 10, reason: 'Must be refused', idempotency_key: 'launch-denied-' + run })
  check(refusedAward.status === 403, 'staff without award permission are refused by the API')
  const readerSession = await context()
  await readerSession.page.goto(base + '/loyalty/login')
  await readerSession.page.getByLabel('Email', { exact: true }).fill(fixture.roles.reader.email)
  await readerSession.page.getByLabel('Password', { exact: true }).fill(fixture.roles.reader.password)
  await readerSession.page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await readerSession.page.waitForURL(url => url.pathname === '/loyalty', { timeout: 20000 })
  await readerSession.page.goto(base + '/loyalty/members/' + enrolled.id)
  await readerSession.page.getByRole('heading', { name: member.name, exact: true }).waitFor()
  check(await readerSession.page.getByRole('button', { name: /^(Award|Redeem) points$/ }).count() === 0, 'ordinary staff do not see financial actions they cannot use')
  check((await api(memberSession.ctx, memberToken, 'admin/loyalty/members')).status === 403, 'a member token cannot read the staff member directory')
  check((await api(managerSession.ctx, reader, 'admin/loyalty/wallet')).status === 403, 'ordinary staff cannot read wallet credential settings')
  const scan = await api(managerSession.ctx, managerToken, 'admin/loyalty/scan', 'POST', { code: initial.body.member.member_number })
  check(scan.status === 200 && scan.body.member.id === enrolled.id, 'desk lookup recognises the real member number')
  const reversed = await api(managerSession.ctx, managerToken, `admin/loyalty/members/${enrolled.id}/history/${awardBody.line}/reverse`, 'POST', { reason: 'Launch journey correction' })
  check(reversed.status === 200 && reversed.body.member.points === initialPoints - 200, 'manager reversal restores the exact ledger balance')
  const off = await api(managerSession.ctx, managerToken, `admin/loyalty/members/${enrolled.id}/deactivate`, 'POST')
  check(off.status === 200, 'manager can deactivate the test member')
  const deniedScan = await api(managerSession.ctx, managerToken, 'admin/loyalty/scan', 'POST', { code: initial.body.member.member_number })
  check(deniedScan.status === 404 && deniedScan.body.error === 'inactive', 'deactivated member is refused at the desk')
  check((await api(memberSession.ctx, memberToken, `member/rewards/${created.body.reward.id}/redeem`, 'POST')).status >= 400, 'deactivated member cannot claim another reward')
  check((await api(managerSession.ctx, managerToken, `admin/loyalty/members/${enrolled.id}/reactivate`, 'POST')).status === 200, 'manager can reactivate the member')
  check((await api(managerSession.ctx, managerToken, 'admin/loyalty/scan', 'POST', { code: initial.body.member.member_number })).status === 200, 'reactivation restores desk access')
  const history = await api(managerSession.ctx, managerToken, `admin/loyalty/members/${enrolled.id}/history`)
  check(history.status === 200, 'the member’s ledger history remains available after correction')
  // Insights deliberately reports completed venue days; advance the test server rather than backdating rows.
  await fs.writeFile(process.env.LAUNCH_CLOCK_FILE, '2026-11-10T10:00:00Z')
  const report = await api(managerSession.ctx, managerToken, 'admin/loyalty/insights/report?from=2026-11-09&to=2026-11-09&compare=none')
  check(report.status === 200, 'Insights reads the actual rehearsal transactions')
  check(report.body.current.fulfilled >= 1 && report.body.current.redeemed >= 200 && report.body.rewards.some(row => row.id === created.body.reward.id && row.claims === 1), 'completed-day Insights reconciles the real fulfilled reward')
  await managerPage.goto(base + '/loyalty/insights')
  await managerPage.getByRole('heading', { name: 'Insights', exact: true }).waitFor()
  await managerPage.goto(base + '/loyalty/app')
  await managerPage.getByText('Member app designer', { exact: true }).waitFor()
  check(await managerPage.locator('[data-design] .l-ca-status').allTextContents().then(labels => labels.length === 2 && labels.every(label => label === 'On hold')), 'unconnected app designers remain on hold with a real backend')
  const wallet = await api(managerSession.ctx, managerToken, 'admin/loyalty/wallet')
  check(wallet.status === 200 && !wallet.body.wallet.apple_ready && !wallet.body.wallet.google_ready, 'missing provider credentials are not represented as ready')
  await memberPage.goto(base + '/portal')
  await memberPage.waitForLoadState('networkidle')
  check(await memberPage.getByRole('button', { name: /^Add to (Google|Apple) Wallet$/ }).count() === 0, 'unconfigured wallet providers are not advertised on the real member card')
  const sms = await api(managerSession.ctx, managerToken, 'admin/loyalty/sms')
  check(sms.status === 200 && !sms.body.twilio.ready, 'missing Twilio configuration is reported honestly')
  const probeRequested = JSON.parse((await artisan('loyalty:launch-audit', '--queue-probe')).stdout)
  check(probeRequested.queue.probe_request === 'queued', 'explicit safe infrastructure probe enters the real database queue')
  await worker()
  const probeObserved = JSON.parse((await artisan('loyalty:launch-audit')).stdout)
  check(probeObserved.queue.probe.value?.status === 'processed', 'a separate worker acknowledges the probe through shared cache')

  result.phase = 'campaign consent and database queue'
  const segment = await api(managerSession.ctx, managerToken, 'admin/loyalty/segments', 'POST', { name: 'Launch audience ' + run, everyone: true, operator: 'AND', filters: [] })
  check(segment.status === 201, 'manager creates the real rehearsal audience')
  async function draftCampaign(name) {
    const draft = await api(managerSession.ctx, managerToken, 'admin/loyalty/campaigns', 'POST', { name })
    check(draft.status === 201, 'email draft is created: ' + name)
    const saved = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${draft.body.campaign.id}`, 'PUT', { name, subject: name, segment_id: segment.body.segment.id, body_blocks: [{ id: 'launch-text', type: 'text', text: 'Controlled local delivery rehearsal. No external recipient.' }] })
    check(saved.status === 200, 'email blocks are saved by the shared campaign writer')
    return saved.body.campaign
  }
  const campaign = await draftCampaign('Launch queued email ' + run)
  const beforeConsent = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${campaign.id}/audience`)
  check(beforeConsent.status === 200, 'server computes the audience before consent')
  check((await api(memberSession.ctx, memberToken, 'member/profile', 'PUT', { marketing_consent: true, email_notifications: true })).status === 200, 'test member explicitly opts into email offers')
  const audience = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${campaign.id}/audience`)
  check(audience.status === 200 && audience.body.audience.reached === beforeConsent.body.audience.reached + 1, 'email audience increases only after explicit consent')
  const sendBody = { recipients: audience.body.audience.reached, revision: campaign.revision }
  const started = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${campaign.id}/send`, 'POST', sendBody)
  check(started.status === 200 && started.body.campaign.status === 'sending', 'confirmed campaign is queued rather than reported delivered early')
  await worker()
  const sent = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${campaign.id}`)
  check(sent.body.campaign.status === 'sent' && sent.body.campaign.sent_count === audience.body.audience.reached, 'a real database worker processes the captured campaign')
  const retrySend = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${campaign.id}/send`, 'POST', sendBody)
  check(retrySend.status >= 400, 'completed campaign cannot be sent again with a repeated request')

  result.phase = 'scheduled campaign and unsubscribe'
  const later = await draftCampaign('Launch scheduled email ' + run)
  const scheduled = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${later.id}/schedule`, 'POST', { send_at: '2026-11-10T14:00', revision: later.revision })
  check(scheduled.status === 200 && scheduled.body.campaign.status === 'scheduled', 'campaign stores the venue’s scheduled wall-clock time')
  await fs.writeFile(process.env.LAUNCH_CLOCK_FILE, '2026-11-10T13:00:00Z')
  await artisan('loyalty:send-scheduled')
  await worker()
  const laterSent = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${later.id}`)
  check(laterSent.body.campaign.status === 'sent', 'scheduler command and database worker deliver the due captured campaign')
  check((await api(memberSession.ctx, memberToken, 'member/profile', 'PUT', { marketing_consent: false })).status === 200, 'member can withdraw email marketing consent')
  const afterConsent = await api(managerSession.ctx, managerToken, `admin/loyalty/campaigns/${campaign.id}/audience`)
  check(afterConsent.status === 200 && afterConsent.body.audience.reached === audience.body.audience.reached - 1, 'withdrawing consent immediately removes the member from the audience')

  result.phase = 'member password recovery'
  const capturePath = path.join(process.env.LARAVEL_STORAGE_PATH, 'logs', 'laravel.log')
  const previousCapture = await fs.readFile(capturePath, 'utf8').catch(() => '')
  const recoverySession = await context()
  const recovery = recoverySession.page
  await recovery.goto(base + '/forgot-password')
  await recovery.getByLabel('Email', { exact: true }).fill(member.email)
  await recovery.getByRole('button', { name: 'Send reset code', exact: true }).click()
  await recovery.getByLabel('Reset code', { exact: true }).waitFor()
  await worker()
  const captured = (await fs.readFile(capturePath, 'utf8')).slice(previousCapture.length).replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  const resetCode = captured.match(/class="code">\s*(\d{6})\s*<\/div>/)?.[1]
  check(!!resetCode, 'password-reset message reaches the isolated mail capture through the database worker')
  const nextPassword = randomBytes(27).toString('base64url'); secrets.push(nextPassword)
  await recovery.getByLabel('Reset code', { exact: true }).fill(resetCode)
  await recovery.getByLabel('New password', { exact: true }).fill(nextPassword)
  await recovery.getByLabel('Confirm new password', { exact: true }).fill(nextPassword)
  await recovery.getByRole('button', { name: 'Update password', exact: true }).click()
  await recovery.getByText('Password updated', { exact: true }).waitFor()
  check(true, 'member can complete password recovery through the real UI')
  const rejectedOld = await recoverySession.ctx.request.post(base + '/api/v1/auth/login', { data: { email: member.email, password: member.password }, headers: { Accept: 'application/json' } })
  check(rejectedOld.status() === 422, 'old member password is refused by credential validation after reset')
  check((await api(memberSession.ctx, memberToken, 'member/portal')).status === 401, 'password recovery revokes the old member session')
  await recovery.goto(base + '/login')
  await recovery.getByLabel('Email', { exact: true }).fill(member.email)
  await recovery.getByLabel('Password', { exact: true }).fill(nextPassword)
  await recovery.getByRole('button', { name: 'Sign in', exact: true }).click()
  await recovery.waitForURL(url => url.pathname === '/portal', { timeout: 20000 })
  check(true, 'returning member signs in with the new password and lands in their portal')
  memberPage = recovery
  const replacementToken = await memberPage.evaluate(() => localStorage.getItem('auth_token'))
  const recoveredPortal = await api(recoverySession.ctx, replacementToken, 'member/portal')
  check(recoveredPortal.status === 200 && recoveredPortal.body.member.current_points === initialPoints - 200, 'recovered account keeps the reconciled member balance')
  fixture.member.password = nextPassword
  await fs.writeFile(process.env.LAUNCH_FIXTURE, JSON.stringify(fixture))
  for (const [label, page] of [['staff', managerPage], ['member', memberPage]]) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' real journey fits mobile')
    await page.screenshot({ path: path.join(out, label + '-mobile.png'), fullPage: false })
  }

  check(result.errors.length === 0, 'no browser runtime errors')
  check(result.serverErrors.length === 0, 'no unexpected server failures during the real browser journey')
  result.phase = 'completed'
} catch (error) {
  result.failure = scrub(error.message.split('\n')[0]); process.exitCode = 1
  console.error('FAIL ' + result.phase + ': ' + result.failure)
  for (const [label, page] of [['manager', managerPage], ['member', memberPage]]) if (page) {
    await page.screenshot({ path: path.join(out, label + '-failure.png'), fullPage: false }).catch(() => {})
    await fs.writeFile(path.join(out, label + '-failure.txt'), scrub(await page.locator('body').innerText().catch(() => '')))
  }
} finally {
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2))
  await browser.close()
}
