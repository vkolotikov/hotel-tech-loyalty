/** Final combined review: exercise production components under held responses. */
export async function finalChecks({ page, open, hook, receipt, output }) {
  if (!process.env.CONTENT_FINAL_CLOCK_ONLY) for (const full of [false, true]) {
    await open()
    await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
    if (full) await page.getByRole('link', { name: 'Full editor', exact: true }).click()
    const seq = await page.evaluate(() => window.__panel.target.seq)
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
    await page.waitForFunction(() => window.__auditData.pending.some(p => p.url.includes('/duplicate')))
    await hook().fill('Typed while Duplicate waits')
    await page.evaluate(() => window.__finish())
    await page.waitForTimeout(100)
    const state = await page.evaluate(() => ({ id: window.__panel.target.id, seq: window.__panel.target.seq, dirty: window.__panel.holdsEdits(), copy: window.__cachedPost(999) }))
    const words = await hook().inputValue()
    await receipt(`Duplicate retains later typing in same ${full ? 'full' : 'panel'} opening and caches copy`, state.id === 301 && state.seq === seq && state.dirty && state.copy?.id === 999 && words === 'Typed while Duplicate waits', { state, seq, words })
    if (full) {
      await receipt('Pending Duplicate preserves full route identity', await page.locator('#route').textContent() === '/content/write/301')
      await page.getByRole('link', { name: 'Open in panel' }).click()
      await receipt('Duplicate retained text survives full to panel', await hook().inputValue() === 'Typed while Duplicate waits')
    }
    await page.locator('[data-content]').evaluate((el, value) => { el.dataset.theme = value }, full ? 'dark' : 'light')
    await page.setViewportSize({ width: full ? 390 : 1440, height: full ? 844 : 1000 })
    await page.locator(full ? '[data-panel][role="dialog"]' : '[data-panel][role="complementary"]').waitFor()
    await page.evaluate(async () => { await Promise.allSettled(document.getAnimations().map(animation => animation.finished)) })
    await hook().focus()
    await receipt(`Retained Duplicate typing keeps focus ${full ? 'dark phone' : 'light desktop'}`, await hook().evaluate(el => el === document.activeElement))
    await page.screenshot({ path: `${output}/final-duplicate-${full ? 'dark-phone' : 'light-desktop'}.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  if (!process.env.CONTENT_FINAL_CLOCK_ONLY) for (const full of [false, true]) {
    await open()
    await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
    if (full) await page.getByRole('link', { name: 'Full editor', exact: true }).click()
    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
    await page.evaluate(() => window.__finish())
    await page.waitForFunction(() => window.__panel.target.id === 999)
    await receipt(`Clean Duplicate still opens saved copy in ${full ? 'full' : 'panel'}`, await page.evaluate(() => !window.__panel.holdsEdits()))
    if (full) {
      await page.waitForFunction(() => document.querySelector('#route').textContent === '/content/write/999')
      await page.getByRole('button', { name: 'Audit back', exact: true }).click()
      await page.waitForFunction(() => window.__panel.target.id === 301)
      await receipt('Clean Duplicate full route Back returns to original post', await page.locator('#route').textContent() === '/content/write/301')
    }
  }

  if (!process.env.CONTENT_FINAL_CLOCK_ONLY) for (const full of [false, true]) for (const action of ['ready', 'published']) {
    await open()
    const seen = '2026-11-13T06:00:00.123456Z'
    await page.evaluate(seen => window.__seedReviewPost(seen), seen)
    await page.getByRole('button', { name: 'Audit saved post', exact: true }).click()
    if (full) await page.getByRole('link', { name: 'Full editor', exact: true }).click()
    await hook().waitFor()
    const reads = await page.evaluate(() => window.__auditData.requests.filter(r => r.method === 'GET' && /\/posts\/301\?/.test(r.url)).length)
    await page.getByRole('button', { name: action === 'ready' ? 'Mark ready' : 'Mark published', exact: true }).click()
    if (action === 'published') await page.getByRole('button', { name: 'Mark published', exact: true }).last().click()
    const request = await page.evaluate(() => window.__auditData.pending[0])
    const afterReads = await page.evaluate(() => window.__auditData.requests.filter(r => r.method === 'GET' && /\/posts\/301\?/.test(r.url)).length)
    await receipt(`${full ? 'Full' : 'Panel'} Mark ${action} sends viewed full revision without refreshing unseen content`, request?.body?.updated_at === seen && request.url.includes(`/mark-${action}`) && afterReads === reads)
    await page.evaluate(() => window.__refuseStaleAction())
    await page.getByText('Someone changed this post since you opened it. Read it again before approving.', { exact: true }).waitFor()
    await receipt(`${full ? 'Full' : 'Panel'} Mark ${action} explains conflict without adopting unseen words`, await hook().inputValue() === 'Seen words' && await page.evaluate(() => window.__editor.post.updated_at) === seen)
  }
  await open()
  await page.getByRole('link', { name: 'Audit settings' }).click()
  const zone = () => page.getByRole('combobox', { name: 'Planning time zone', exact: true })
  await receipt('Planning zone starts with authoritative account clock', await zone().inputValue() === 'Europe/Riga')
  await page.getByRole('button', { name: 'Audit switch brand', exact: true }).click()
  await zone().selectOption('Europe/Paris')
  await page.getByRole('button', { name: 'Save account time zone', exact: true }).click()
  await page.evaluate(() => window.__finish())
  await page.waitForFunction(() => window.__auditData.settings.timezone === 'Europe/Paris')
  await page.getByRole('button', { name: 'Audit switch brand', exact: true }).click()
  await receipt('Clean retained brand A adopts account clock saved from brand B', await zone().inputValue() === 'Europe/Paris')
  await page.evaluate(() => { window.__auditData.settings.timezone = 'Europe/Berlin'; window.__refreshSettings() })
  await page.waitForTimeout(80)
  await receipt('Clean clock form adopts authoritative refetch', await zone().inputValue() === 'Europe/Berlin')
  await zone().selectOption('Europe/Riga')
  await page.evaluate(() => { window.__auditData.settings.timezone = 'Europe/Paris'; window.__refreshSettings() })
  await page.waitForTimeout(80)
  await receipt('Dirty intentional clock choice survives authoritative refetch', await zone().inputValue() === 'Europe/Riga')
  await page.getByRole('link', { name: 'Plan navigation' }).click()
  await page.getByRole('link', { name: 'Audit settings' }).click()
  await receipt('Dirty clock draft survives route remount', await zone().inputValue() === 'Europe/Riga')
  for (const theme of ['light', 'dark']) {
    await page.locator('[data-content]').evaluate((el, value) => { el.dataset.theme = value }, theme)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await zone().focus()
      await receipt(`Clock select keeps visible keyboard focus ${theme}/${width}`, await zone().evaluate(el => el === document.activeElement))
      await page.screenshot({ path: `${output}/final-clock-${theme}-${width}.png`, fullPage: true })
    }
  }
}
