import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Run only against a local dev/preview server. API calls are intercepted; no customer data is changed.
const base = process.env.E2E_BASE || 'http://127.0.0.1:5173'
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('E2E_BASE must be a local fixture server')
const out = path.resolve(process.env.E2E_OUTPUT || 'test-results/browser').replaceAll('\\', '/') + '/'
await fs.mkdir(out, { recursive: true })
const specs = {
  overview: ['overview.browser.js'],
  members: ['members-program.browser.js', 'members-program.checks.js'],
  earn: ['ways-to-earn.browser.js', 'ways-to-earn.interactions.browser.js', 'ways-to-earn.states.browser.js'],
  rewards: ['rewards-benefits.browser.js', 'rewards-benefits.interactions.js', 'rewards-benefits.states.js'],
  events: ['events.browser.js', 'events.interactions.js', 'events.states.js'],
  requests: ['requests.browser.js', 'requests.interactions.js', 'requests.states.js'],
  insights: ['insights.browser.js', 'insights.states.js'],
  card: ['card-app.browser.js', 'card-app.states.js'],
  campaigns: ['campaigns.browser.js', 'campaigns.states.js'],
  scan: ['scan.browser.js', 'scan.states.js', 'scan.integration.js'],
  settings: ['settings-setup.browser.js'],
  mobile: ['overview', 'members-program', 'requests'],
}
const groups = (process.env.E2E_GROUPS || Object.keys(specs).join(',')).split(',')
const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHANNEL === 'chromium' ? {} : { channel: process.env.E2E_CHANNEL || 'chrome' }) })
const results = []
async function source(file, dir) {
  return (await fs.readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/C:\/wamp64\/www\/Hexa-Tech\/docs\/loyalty-redesign\/evidence\/[^'"\r\n]*/g, dir)
    .replaceAll('http://127.0.0.1:5173', base)
}
const run = (text, ...args) => Function(`return (${text})`)()(...args)
try {
  for (const group of groups) {
    if (!specs[group]) throw Error(`Unknown E2E group: ${group}`)
    for (const file of specs[group]) {
      const dir = out + group + '/' + file.replaceAll('.', '-') + '/'
      await fs.mkdir(dir, { recursive: true })
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort()
        if (url.pathname.includes('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Missing local fixture"}' })
        return route.continue()
      })
      const page = await context.newPage(), errors = []
      page.setDefaultTimeout(15000)
      page.on('pageerror', error => errors.push(error.message))
      try {
        let answer
        if (group === 'mobile') {
          let fixture = await source(file + '.browser.js', dir)
          fixture = fixture.slice(0, fixture.indexOf(file === 'overview' ? '  const check=' : '  await page.setViewportSize')) + '\nreturn state;\n}'
          const state = await run(fixture, page)
          if (file === 'members-program') await page.route('**/api/**', route => {
            const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split('/admin/loyalty/')[1]
            if (endpoint === 'rewards' && request.method() === 'GET') return route.fulfill({ json: { rewards: [{ id: 1, name: 'Complimentary coffee', description: 'A coffee of your choice.', terms: 'Subject to availability.', points_cost: 500, is_active: true }], options: {} } })
            if (endpoint === 'members' && request.method() === 'POST') {
              state.requests.push({ path: endpoint, query: url.search, method: 'POST', payload: request.postDataJSON() })
              return route.fulfill({ json: { member: { id: 1, name: request.postDataJSON().name } } })
            }
            return route.fallback()
          })
          answer = await run(await source('mobile-web.browser.js', dir), page, { base, root: dir, group: file, state })
        } else if (group === 'settings') {
          const fixture = await source('ways-to-earn.browser.js', dir)
          const earn = JSON.parse(fixture.match(/const answer=(.*);/)[1])
          answer = await run(await source(file, dir), page, earn)
        } else {
          // Every state/interaction script starts with a fresh context and fixture, not the previous script's mutations.
          if (file !== specs[group][0]) await run(await source(specs[group][0], dir), page)
          let extra
          if (file === 'scan.integration.js') {
            const z = await import('@zxing/library')
            const matrix = new z.QRCodeWriter().encode('M-1048', z.BarcodeFormat.QR_CODE, 400, 400, new Map())
            let pixels = ''
            for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if (matrix.get(x, y)) pixels += `M${x} ${y}h1v1h-1z`
            extra = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="white"/><path fill="black" d="${pixels}"/></svg>`
          }
          answer = await run(await source(file, dir), page, extra)
        }
        const failed = answer?.results?.filter(test => test.status !== 'PASS') || []
        if (failed.length || errors.length || answer?.errors?.length || answer?.pageErrors?.length) throw Error(JSON.stringify({ failed, errors, reported: answer?.errors || answer?.pageErrors }))
        const count = Array.isArray(answer) ? answer.length : answer?.checks?.length ?? answer?.passed ?? 0
        const result = { group, file, passed: count, answer, errors }
        results.push(result)
        await fs.writeFile(dir + 'result.json', JSON.stringify(result, null, 2))
        console.log(`${group}/${file}: ${count} checks passed`)
      } catch (error) {
        results.push({ group, file, failed: true, error: String(error), errors })
        await page.screenshot({ path: dir + 'failure.png', fullPage: false }).catch(() => {})
        await fs.writeFile(dir + 'failure.txt', String(error) + '\n' + await page.locator('body').innerText().catch(() => ''))
        console.error(`${group}/${file}: ${String(error).slice(0, 350)}`)
        process.exitCode = 1
      } finally { await context.close() }
    }
  }
} finally {
  await fs.writeFile(out + 'results.json', JSON.stringify(results, null, 2))
  await browser.close()
}
