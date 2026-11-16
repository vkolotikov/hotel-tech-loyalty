/** Campaign is an ordinary field of the one shared draft, including post-click undo intent. */
export async function campaignChecks({ page, open, receipt }) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await open()
  await page.getByRole('link', { name: 'Audit full composer', exact: true }).click()
  const campaign = () => page.getByLabel('Campaign', { exact: true })
  await campaign().selectOption('17')
  const seq = await page.evaluate(() => window.__panel.target.seq)
  await page.getByRole('button', { name: 'Create post', exact: true }).click()
  await campaign().selectOption('18')
  await page.getByRole('link', { name: 'Open in panel', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#route').textContent === '/content')
  await page.evaluate(() => window.__finish())
  await page.waitForFunction(() => window.__editor.post?.id === 101)
  await receipt('Campaign Create keeps later choice and original opening across full to panel', await campaign().inputValue() === '18' && await page.evaluate(seq => window.__panel.target.seq === seq && window.__editor.editing.base.campaign_id === '17', seq))
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await campaign().selectOption('17')
  if (await page.getByRole('link', { name: 'Full editor', exact: true }).count()) {
    await page.getByRole('link', { name: 'Full editor', exact: true }).click()
  } else {
    await page.getByRole('link', { name: 'Open in panel', exact: true }).click()
  }
  await page.evaluate(() => window.__finish())
  await page.waitForFunction(() => window.__editor.editing.base.campaign_id === '18')
  await receipt('Campaign undo during Save stays dirty after remount and rebase', await campaign().inputValue() === '17' && await page.evaluate(() => window.__editor.dirty))
  await page.getByRole('button', { name: 'Save draft', exact: true }).first().click()
  await receipt('Next Save writes campaign to the same created post', await page.evaluate(() => window.__auditData.pending.some(r => r.method === 'PUT' && r.url.includes('/posts/101?') && r.body.campaign_id === 17)))
  await page.evaluate(() => window.__finish())
}
