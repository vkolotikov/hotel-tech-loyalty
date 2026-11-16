import { fixChecks } from './fix-checks.mjs'
import { finalChecks } from './final-checks.mjs'
import { campaignChecks } from './campaign-checks.mjs'
import { collaborationChecks } from './collaboration-checks.mjs'
import { launchChecks } from './launch-checks.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import tailwind from '@tailwindcss/vite'
const root = path.dirname(fileURLToPath(import.meta.url)).replaceAll('\\', '/')
const frontend = path.resolve(root, '../..').replaceAll('\\', '/')
const modules = frontend + '/node_modules'
const source = process.env.CONTENT_DRAFT_SOURCE ?? frontend
const output = process.env.CONTENT_DRAFT_EVIDENCE ?? root + '/artifacts'
await fs.mkdir(output, { recursive: true })
const server = await createServer({ configFile: false, root, esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /^\.\.\/\.\.\/src\//, replacement: source + '/src/' },
  { find: /^react$/, replacement: modules + '/react/index.js' },
  { find: /^react\/(.*)$/, replacement: modules + '/react/$1' },
  { find: /^react-dom\/(.*)$/, replacement: modules + '/react-dom/$1' },
  { find: /^react-i18next$/, replacement: modules + '/react-i18next/dist/es/index.js' },
  { find: /^i18next$/, replacement: modules + '/i18next/dist/esm/i18next.js' },
  { find: /^@tanstack\/react-query$/, replacement: modules + '/@tanstack/react-query/build/modern/index.js' },
  { find: /^react-router-dom$/, replacement: modules + '/react-router-dom/dist/index.mjs' },
] }, plugins: [tailwind(), { name: 'audit-api-only', enforce: 'pre', resolveId(source, importer) {
  if (importer && /\/content\/lib\/api\.ts$/.test(importer.replaceAll('\\', '/')) && source === '../../lib/api') return root + '/api.ts'
} }], server: { host: '127.0.0.1', port: 5187, strictPort: true, fs: { allow: [root, frontend, source] } }, cacheDir: root + '/.vite' })
await server.listen()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(10000)
await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
const errors = []
const receipt = async (name, passed, detail = {}) => { evidence.checks.push({ name, passed, ...detail }); if (!passed) throw new Error(name) }
page.on('pageerror', error => errors.push(error.message))
const evidence = { createdAt: new Date().toISOString(), scope: 'Production React components; fake in-memory API, no production network or data', checks: [], errors }
const open = async () => { page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept()); await page.goto('http://127.0.0.1:5187'); await page.getByRole('button', { name: 'Audit new post', exact: true }).waitFor() }
const hook = () => page.getByPlaceholder('Write the first line people see', { exact: true })
const snapshot = () => page.evaluate(() => ({ target: window.__panel.target, dirty: window.__panel.holdsEdits(), pending: window.__auditData.pending.map(({ method, url, body }) => ({ method, url, body })), saved: window.__auditData.posts, hook: document.querySelector('textarea')?.value, brand: document.querySelector('#target')?.textContent }))
try {
  if (process.env.CONTENT_FINAL_CHECKS) await finalChecks({ page, open, hook, receipt, output })
  if (!process.env.CONTENT_DRAFT_BASELINE) {
    await open()
    await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
    await hook().fill('Discarded Create')
    await page.getByRole('button', { name: 'Create post', exact: true }).click()
    const discardedOpening = await page.evaluate(() => window.__panel.target.seq)
    await page.locator('[data-panel]').getByRole('button', { name: 'Close', exact: true }).click()
    await page.evaluate(() => window.__workspace(false))
    await page.getByText('Outside workspace', { exact: true }).waitFor()
    await page.evaluate(() => window.__workspace(true))
    await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
    await hook().fill('Unrelated new draft')
    const unrelatedOpening = await page.evaluate(() => window.__panel.target.seq)
    await page.evaluate(() => window.__finish())
    await page.waitForFunction(() => window.__auditData.pending.length === 0)
    await page.waitForTimeout(100)
    const unrelated = await snapshot()
    evidence.checks.push({ name: 'Discarded Create cannot adopt an unrelated opening after workspace remount', passed: unrelated.target?.kind === 'new' && unrelated.hook === 'Unrelated new draft' && discardedOpening !== unrelatedOpening, discardedOpening, unrelatedOpening, after: unrelated })

    await open()
    await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
    await hook().fill('Discard before template creation')
    // Template creation captures ownership after guard accepts discarding the previous post.
    const afterGuard = await page.evaluate(() => {
      const before = window.__panel.capture()
      const accepted = window.__panel.guard()
      return { accepted, oldCapture: before(), nextCapture: window.__panel.capture()() }
    })
    evidence.checks.push({ name: 'Accepted discard fences old captures and permits the next guarded creation', passed: afterGuard.accepted && !afterGuard.oldCapture && afterGuard.nextCapture, after: afterGuard })

    await open()
    await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
    // Accept the initial calendar/platform draft as-is: no field is edited before Create.
    const unchangedOpening = await page.evaluate(() => window.__panel.target.seq)
    await page.getByRole('button', { name: 'Create post', exact: true }).click()
    await page.evaluate(() => window.__workspace(false))
    await page.getByText('Outside workspace', { exact: true }).waitFor()
    await page.evaluate(() => window.__workspace(true))
    await page.getByRole('button', { name: 'Audit new post', exact: true }).waitFor()
    const retainedUnchanged = await page.evaluate(() => ({ target: window.__panel.target, saving: window.__editor?.saving, dirty: window.__editor?.dirty }))
    evidence.checks.push({ name: 'Unchanged pending Create retains its opening and busy state through remount', passed: retainedUnchanged.target?.seq === unchangedOpening && retainedUnchanged.saving === true && retainedUnchanged.dirty === false, after: retainedUnchanged })
    await page.evaluate(() => window.__finish())
    await page.waitForTimeout(100)
    const completedUnchanged = await page.evaluate(() => ({ target: window.__panel.target, saving: window.__editor?.saving, dirty: window.__editor?.dirty }))
    evidence.checks.push({ name: 'Unchanged retained Create adopts its identity on acknowledgement', passed: completedUnchanged.target?.seq === unchangedOpening && completedUnchanged.target?.kind === 'post' && completedUnchanged.saving === false && completedUnchanged.dirty === false, after: completedUnchanged })
  }
  if (!process.env.CONTENT_DRAFT_REVIEW_ONLY) {
  await open()
  await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
  await hook().fill('Submitted hook')
  await page.getByRole('button', { name: 'Create post', exact: true }).click()
  await hook().fill('Typed after clicking Create')
  const before = await snapshot()
  await page.evaluate(() => window.__finish())
  await page.getByRole('heading', { name: 'Post details', exact: true }).waitFor()
  const after = await snapshot()
  evidence.checks.push({ name: 'Create preserves newer typing', before, after, passed: after.hook === 'Typed after clicking Create' })

  await hook().fill('Replacement sent with Save')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await hook().fill('Submitted hook')
  const beforeUndoDuringSave = await snapshot()
  await page.evaluate(() => window.__finish())
  await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
  const afterUndoDuringSave = await snapshot()
  evidence.checks.push({ name: 'Save preserves intentional undo', before: beforeUndoDuringSave, after: afterUndoDuringSave, passed: afterUndoDuringSave.hook === 'Submitted hook' })

  await open()
  await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
  await hook().fill('Brand A request')
  await page.getByRole('button', { name: 'Create post', exact: true }).click()
  await page.getByRole('button', { name: 'Audit switch brand', exact: true }).click()
  await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
  await hook().fill('Brand B unsaved work')
  const beforeSwitchFinish = await snapshot()
  await page.evaluate(() => window.__finish())
  await page.waitForTimeout(100)
  const afterSwitchFinish = await snapshot()
  evidence.checks.push({ name: 'Old-brand Create cannot steal the new opening', before: beforeSwitchFinish, after: afterSwitchFinish, passed: afterSwitchFinish.target?.kind === 'new' && afterSwitchFinish.hook === 'Brand B unsaved work' })

  await open()
  await page.getByRole('link', { name: 'Brand settings', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Brand name', { exact: true }).fill('Unsaved brand setting')
  const settingsDirty = await snapshot()
  // Internal navigation must retain drafts, including Back.
  await page.getByRole('link', { name: 'Plan navigation', exact: true }).click()
  await page.getByRole('link', { name: 'Brand settings', exact: true }).click()
  await page.waitForTimeout(150)
  if (await page.getByRole('button', { name: 'Edit', exact: true }).count()) await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const reopened = await page.getByLabel('Brand name', { exact: true }).inputValue()
  evidence.checks.push({ name: 'Brand section draft survives internal navigation', settingsDirty, reopened, passed: reopened === 'Unsaved brand setting' })

  await page.getByLabel('Brand name', { exact: true }).fill('Submitted brand name')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByLabel('Brand name', { exact: true }).fill('Typed while brand Save pending')
  const settingsPending = await page.getByLabel('Brand name', { exact: true }).inputValue()
  await page.evaluate(() => window.__finish())
  await page.waitForTimeout(100)
  await page.waitForTimeout(150)
  if (await page.getByRole('button', { name: 'Edit', exact: true }).count()) await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const settingsAfterSave = await page.getByLabel('Brand name', { exact: true }).inputValue()
  evidence.checks.push({ name: 'Brand section Save preserves pending edits', before: settingsPending, after: settingsAfterSave, passed: settingsAfterSave === 'Typed while brand Save pending' })

  await open()
  await page.getByRole('link', { name: 'All posts', exact: true }).click()
  await page.getByText('Brand A exclusive post', { exact: true }).waitFor()
  await page.evaluate(() => { window.__auditData.holdBrandBPosts = true })
  await page.getByRole('button', { name: 'Audit switch brand', exact: true }).click()
  await page.waitForFunction(() => window.__auditData.pending.some(p => p.method === 'GET' && p.url.includes('brand_id=4')))
  const mixedPosts = await page.evaluate(() => ({ brand: document.querySelector('#target')?.textContent, oldPostVisible: document.body.textContent?.includes('Brand A exclusive post'), pending: window.__auditData.pending.map(({method, url}) => ({method, url})) }))
  evidence.checks.push({ name: 'Posts placeholder never shows another brand', after: mixedPosts, passed: mixedPosts.oldPostVisible === false })

  await open()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
  await page.getByRole('heading', { name: 'New post', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  const focusAfterReverseTab = await page.evaluate(() => ({ active: document.activeElement?.textContent, withinPanel: !!document.activeElement?.closest('[data-panel]'), role: document.querySelector('[data-panel]')?.getAttribute('role'), ariaModal: document.querySelector('[data-panel]')?.getAttribute('aria-modal') }))
  evidence.checks.push({ name: 'Phone panel traps visible focus', after: focusAfterReverseTab, passed: focusAfterReverseTab.withinPanel === true && focusAfterReverseTab.ariaModal === 'true' })
  if (process.env.CONTENT_DRAFT_BASELINE) throw new Error('Baseline seven-case run complete')
  await receipt('Phone covered navigation is inert', await page.locator('nav').evaluate(el => !!el.closest('[inert]')))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('[data-panel][role="complementary"]').waitFor()
  await receipt('Resizing to dock releases the page', await page.locator('nav').evaluate(el => !el.closest('[inert]')))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
  await hook().waitFor()
  await hook().fill('submitted while pending')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await hook().fill('')
  // Undo equals the original base but must still guard a brand switch.
  page.removeAllListeners('dialog')
  let refusedSwitch = 0
  page.on('dialog', dialog => { refusedSwitch++; return dialog.dismiss() })
  await page.getByRole('button', { name: 'Audit switch brand', exact: true }).click()
  await receipt('Pending Save undo still guards brand switch', refusedSwitch === 1 && (await snapshot()).brand.includes('"brand":3'))
  await page.getByRole('link', { name: 'All posts', exact: true }).click()
  await page.getByRole('button', { name: 'Audit back', exact: true }).click()
  await page.evaluate(() => window.__finish())
  await page.waitForTimeout(100)
  await receipt('Pending undo survives navigation and acknowledgement', await hook().inputValue() === '' && await page.evaluate(() => window.__panel.holdsEdits()))

  await open()
  await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
  await hook().fill('Create submitted')
  await page.getByRole('button', { name: 'Create post', exact: true }).click()
  await hook().fill('Typed before leaving workspace')
  await page.evaluate(() => window.__workspace(false))
  await page.getByText('Outside workspace', { exact: true }).waitFor()
  await page.evaluate(() => window.__workspace(true))
  await hook().waitFor()
  await receipt('Pending Create reconnects after workspace remount', await hook().inputValue() === 'Typed before leaving workspace' && await page.evaluate(() => window.__editor.saving))
  await page.evaluate(() => window.__finish())
  await page.getByRole('heading', { name: 'Post details', exact: true }).waitFor()
  await receipt('Reconnected Create changes identity without losing typing', await hook().inputValue() === 'Typed before leaving workspace' && await page.evaluate(() => window.__panel.target.kind === 'post' && !window.__editor.saving))

  await open()
  await page.getByRole('link', { name: 'More Brand forms', exact: true }).click()
  await page.getByRole('button', { name: 'Add a hashtag group', exact: true }).click()
  const snippets = page.locator('[aria-labelledby="content-snippets"]')
  await snippets.getByLabel('Name', { exact: true }).fill('Retained hashtags')
  await page.getByRole('button', { name: 'Add a snippet', exact: true }).click()
  await snippets.getByLabel('Name', { exact: true }).nth(1).fill('Retained snippet')
  await page.getByRole('button', { name: 'Add audience', exact: true }).click()
  await page.locator('[aria-labelledby="content-audiences"]').getByLabel('Name', { exact: true }).fill('Retained audience')
  await page.getByRole('button', { name: 'Add a template', exact: true }).click()
  await page.locator('[aria-labelledby="content-templates"]').getByLabel('Name', { exact: true }).fill('Retained template')
  await page.getByRole('button', { name: 'Edit summary', exact: true }).click()
  await page.locator('[data-company-summary] textarea').fill('Retained summary')
  await page.getByRole('button', { name: 'Set up the page', exact: true }).click()
  await page.locator('#content-bio-name').fill('retained-bio')
  page.removeAllListeners('dialog')
  let brandGuard = 0
  page.on('dialog', dialog => { brandGuard++; return dialog.dismiss() })
  await page.getByRole('button', { name: 'Audit full admin guard', exact: true }).click()
  await receipt('Full-admin guard includes Brand drafts', brandGuard === 1)
  await page.getByRole('link', { name: 'Plan navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Audit back', exact: true }).click()
  await page.locator('[data-company-summary] textarea').waitFor()
  await receipt('Summary and bio survive browser Back', await page.locator('[data-company-summary] textarea').inputValue() === 'Retained summary' && await page.locator('#content-bio-name').inputValue() === 'retained-bio')
  await receipt('Separate hashtag and snippet drafts survive browser Back', (await snippets.getByLabel('Name', { exact: true }).evaluateAll(elements => elements.map(el => el.value))).join('|') === 'Retained hashtags|Retained snippet')
  await receipt('Audience and template drafts survive browser Back', await page.locator('[aria-labelledby="content-audiences"]').getByLabel('Name', { exact: true }).inputValue() === 'Retained audience' && await page.locator('[aria-labelledby="content-templates"]').getByLabel('Name', { exact: true }).inputValue() === 'Retained template')

  await page.locator('[data-bio-add]').click()
  await page.getByLabel('Button 1: label', { exact: true }).fill('Submitted button')
  await page.getByLabel('Button 1: address', { exact: true }).fill('https://example.test/button')
  await page.locator('[data-bio-save]').click()
  await page.getByLabel('Button 1: label', { exact: true }).fill('Button edited while saving')
  await page.evaluate(() => window.__finish())
  await page.waitForTimeout(100)
  await receipt('Bio keeps later button typing after creation', await page.getByLabel('Button 1: label', { exact: true }).inputValue() === 'Button edited while saving')
  await page.locator('[data-bio-save]').click()
  await receipt('Second bio Save updates the same new button id', await page.evaluate(() => window.__auditData.pending[0].body.buttons[0].id === 77))
  await page.evaluate(() => window.__finish())
  await page.locator('[aria-labelledby="content-audiences"]').getByRole('button', { name: 'Save', exact: true }).click()
  await receipt('New audience fields cannot change during Save', await page.locator('[aria-labelledby="content-audiences"]').getByLabel('Name', { exact: true }).isDisabled())
  await page.locator('[aria-labelledby="content-templates"]').getByRole('button', { name: 'Save', exact: true }).click()
  await receipt('New template fields cannot change during Save', await page.locator('[aria-labelledby="content-templates"]').getByLabel('Name', { exact: true }).isDisabled())
  await snippets.locator('textarea').first().fill('#retained')
  await snippets.getByRole('button', { name: 'Save', exact: true }).first().click()
  await receipt('New snippet fields cannot change during Save', await snippets.getByLabel('Name', { exact: true }).first().isDisabled())
  await page.getByRole('button', { name: 'Add channel', exact: true }).click()
  await page.locator('[aria-labelledby="content-channels"]').getByRole('button', { name: 'Save', exact: true }).click()
  await receipt('New channel fields cannot change during Save', await page.locator('[aria-labelledby="content-channels"]').getByLabel('Name', { exact: true }).isDisabled())

  await page.getByRole('link', { name: 'Plan navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Audit back', exact: true }).click()
  await page.locator('[aria-labelledby="content-channels"]').getByLabel('Name', { exact: true }).waitFor()
  await receipt('Pending list creations stay disabled after browser Back',
    await page.locator('[aria-labelledby="content-audiences"]').getByLabel('Name', { exact: true }).isDisabled()
    && await page.locator('[aria-labelledby="content-templates"]').getByLabel('Name', { exact: true }).isDisabled()
    && await snippets.getByLabel('Name', { exact: true }).first().isDisabled()
    && await page.locator('[aria-labelledby="content-channels"]').getByLabel('Name', { exact: true }).isDisabled())

  for (const action of ['Duplicate', 'Delete']) {
    await open()
    await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: action, exact: true }).click()
    if (action === 'Delete') await page.getByRole('button', { name: 'Delete post', exact: true }).click()
    await page.getByRole('button', { name: 'Audit new post', exact: true }).click()
    await hook().fill('New opening must survive ' + action)
    await page.evaluate(() => window.__finish())
    await page.waitForTimeout(100)
    await receipt('Late ' + action + ' leaves another opening intact', await hook().inputValue() === 'New opening must survive ' + action)
  }

  await open()
  await page.evaluate(() => { window.__auditData.failPostRead = true })
  await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor()
  await page.evaluate(() => { window.__auditData.failPostRead = false })
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await hook().waitFor()
  await receipt('Failed post Retry repeats the read and restores the editor', await page.evaluate(() => window.__auditData.requests.filter(r => r.method === 'GET' && r.url.includes('/posts/301?')).length >= 2))

  await open()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save as template', exact: true }).click()
  const nested = page.getByRole('dialog', { name: 'Save as template', exact: true })
  await nested.waitFor()
  for (let index = 0; index < 25; index++) await page.keyboard.press(index % 3 ? 'Tab' : 'Shift+Tab')
  await receipt('Nested modal owns focus above phone editor', await nested.evaluate(el => el.contains(document.activeElement)))
  evidence.modalStyles = await nested.evaluate(el => { const s = getComputedStyle(el); return { background: s.backgroundColor, opacity: s.opacity, bounds: el.getBoundingClientRect().toJSON() } })
  await page.evaluate(async () => { await Promise.allSettled(document.getAnimations().map(animation => animation.finished)) })
  await page.screenshot({ path: output + '/nested-phone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.keyboard.press('Tab')
  await receipt('Nested modal keeps focus when parent becomes dock', await nested.evaluate(el => el.contains(document.activeElement)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('[data-panel][role="dialog"]').waitFor()
  await page.keyboard.press('Escape')
  await receipt('Nested Escape leaves parent open and restores focus', await page.locator('[data-panel]').count() === 1 && await page.locator('[data-panel]').evaluate(el => el.contains(document.activeElement)))
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.textContent === 'Audit saved post')
  await receipt('Closing phone panel restores its opener', await page.getByRole('button', { name: 'Audit saved post', exact: true }).evaluate(el => el === document.activeElement))
  await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.locator('[data-panel][role="dialog"]').waitFor()
  await page.keyboard.press('Shift+Tab')
  await receipt('Tablet overlay traps focus and leaves the page inert', await page.locator('[data-panel]').evaluate(el => el.contains(document.activeElement)) && await page.locator('nav').evaluate(el => !!el.closest('[inert]')))
  for (const locale of ['en', 'de', 'fr', 'es', 'ru']) {
    await page.evaluate(locale => window.__language(locale), locale)
    await receipt('Document language follows ' + locale, await page.locator('html').getAttribute('lang') === locale)
    for (const theme of ['light', 'dark']) {
      await page.locator('[data-content]').evaluate((el, theme) => { el.dataset.theme = theme }, theme)
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
        await page.evaluate(async () => { await document.fonts.ready; await Promise.allSettled(document.getAnimations().map(animation => animation.finished)) })
        await page.screenshot({ path: `${output}/editor-${locale}-${theme}-${width}.png`, fullPage: true })
      }
    }
  }
  await page.screenshot({ path: output + '/final-fixture.png', fullPage: true })
  }
  if (process.env.CONTENT_FIX_CHECKS) await fixChecks({ page, open, hook, receipt, evidence })
  if (process.env.CONTENT_LAUNCH_CHECKS) await launchChecks({ page, open, hook, receipt })
  if (process.env.CONTENT_COLLABORATION_CHECKS) await collaborationChecks({ page, open, receipt })
  if (process.env.CONTENT_CAMPAIGN_CHECKS) await campaignChecks({ page, open, receipt })
} catch (error) {
  evidence.fatal = String(error)
  evidence.html = await page.content()
  process.exitCode = 1
} finally {
  await fs.writeFile(output + '/browser-evidence.json', JSON.stringify(evidence, null, 2))
  if (evidence.checks.some(c => !c.passed)) process.exitCode = 1
  console.log(JSON.stringify({ checks: evidence.checks.map(({ name, passed }) => ({ name, passed })), errors, fatal: evidence.fatal }, null, 2))
  await browser.close()
  await server.close()
}
