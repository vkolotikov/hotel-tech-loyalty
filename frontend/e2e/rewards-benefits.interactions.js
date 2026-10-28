// Run after rewards-benefits.browser.js. Every endpoint is intercepted by that local fixture.
async (page) => {
  const passed = [], base = 'http://127.0.0.1:5173/loyalty/rewards';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const state = async (patch) => page.evaluate(async patch => (await fetch('/api/v1/admin/loyalty/__fixture', patch ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) } : {})).json(), patch);
  const writes = async () => (await state()).requests.filter(r => r.method !== 'GET');
  const go = async query => { await page.goto(base + query); await page.locator('.l-rb-list, .l-rb-editor, .l-rb-page > p[role=status]').first().waitFor(); };
  const rows = async n => page.waitForFunction(n => document.querySelectorAll('.l-rb-row').length === n, n, { timeout: 8000 });
  const input = name => page.getByRole('textbox', { name, exact: true });
  const select = name => page.getByRole('combobox', { name, exact: true });
  const number = name => page.getByRole('spinbutton', { name, exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const lastWrite = async path => (await writes()).filter(r => r.path === path).at(-1);
  const check = async (name, action) => { await action(); passed.push(name); };
  try {
    await check('all catalogue requests retain brand_id=all', async () => { assert((await state()).requests.filter(r => ['rewards', 'offers', 'program'].includes(r.path)).every(r => r.query.includes('brand_id=all')), 'Missing brand scope'); });
    await check('search, status filters, empty results and clearing', async () => {
      await go(''); await page.getByRole('searchbox', { name: 'Search rewards' }).fill('breakfast'); await page.locator('[data-record="reward-4"]').waitFor(); await rows(1);
      await page.getByRole('searchbox').fill('no-such-reward'); await page.getByText('No results match these filters.', { exact: true }).waitFor(); await button('Clear filters').click(); await page.waitForFunction(() => document.querySelector('input[type=search]').value === '');
      await select('Status').selectOption('ended'); await page.locator('[data-record="reward-6"]').waitFor(); await rows(1);
    });
    await check('reward selection changes the preview and edit address', async () => {
      await go(''); await button('Select 10% off a service').click(); await page.getByRole('heading', { name: '10% off a service', exact: true }).waitFor();
      assert((await page.getByRole('link', { name: 'Edit reward', exact: true }).getAttribute('href')).includes('reward=2'), 'Wrong edit ID');
    });
    await check('invalid points are blocked before a write', async () => {
      await go('?reward=1'); await number('Points per claim').fill('0'); const before = (await writes()).length; await button('Save reward').click();
      await page.getByText('Enter a whole number of points from 1 to 1,000,000.', { exact: true }).waitFor(); assert((await writes()).length === before, 'Invalid reward posted');
    });
    await check('dirty reward supports keep editing and discard without saving', async () => {
      await page.getByRole('link', { name: '← All points rewards', exact: true }).click(); await page.getByRole('dialog').waitFor(); await button('Keep editing').click(); assert(await number('Points per claim').inputValue() === '0', 'Lost draft');
      await page.getByRole('link', { name: '← All points rewards', exact: true }).click(); await button('Discard changes').click(); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor();
    });
    await check('reward save preserves all fields, typed discount, brand and venue wall clock', async () => {
      await go('?reward=1'); await input('Reward name').fill('Coffee updated'); await input('Member description').fill('A coffee at the café.'); await number('Points per claim').fill('625');
      await select('Reward type').selectOption('percent_discount'); await number('Amount').fill('15'); await select('Applies to').selectOption('services');
      await select('Availability').selectOption('limited'); await number('Stock').fill('8'); await select('Claims per member').selectOption('custom'); await number('Custom limit').fill('3');
      await select('Valid until').selectOption('date'); await page.getByLabel('Offered until', { exact: true }).fill('2027-01-31T18:30');
      await page.locator('.l-rb-more summary').click(); await input('Category').fill('Dining'); await select('Brand').selectOption('2');
      await button('Edit terms →').click(); await page.getByRole('dialog').getByRole('textbox').fill('Only during café opening hours.'); await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();
      await button('Save reward').click(); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor();
      const body = (await lastWrite('rewards/1')).payload;
      assert(body.name === 'Coffee updated' && body.points_cost === 625 && body.stock === 8 && body.per_member_limit === 3 && body.category === 'Dining' && body.brand === 2 && body.discount_type === 'percent_discount' && body.discount_value === 15 && body.applies_to === 'services' && body.expires_at === '2027-01-31T18:30' && body.terms.includes('opening hours'), 'Reward payload mismatch');
    });
    await check('null stock, limits, expiry and discount are explicitly cleared', async () => {
      await go('?reward=1'); await select('Availability').selectOption('unlimited'); await select('Claims per member').selectOption('none'); await select('Valid until').selectOption('none'); await select('Reward type').selectOption(''); await button('Save reward').click(); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor();
      const body = (await lastWrite('rewards/1')).payload; assert(['stock', 'per_member_limit', 'expires_at', 'discount_type', 'discount_value'].every(k => body[k] === null), 'Fields were not cleared'); assert(!('brand' in body), 'Unchanged brand was resubmitted');
    });
    await check('new reward creation remains separate from image upload', async () => {
      await go('?reward=new'); await page.getByText('You can add a picture once the reward is saved.', { exact: true }).waitFor(); await input('Reward name').fill('New reward'); await number('Points per claim').fill('200'); await button('Save reward').click(); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor(); assert((await lastWrite('rewards')).payload.name === 'New reward', 'Reward create missing');
    });
    await check('image type validation and independent upload/removal', async () => {
      await go('?reward=1'); await button('Add a picture').click(); const dialog = page.getByRole('dialog'); const file = dialog.locator('input[type=file]'); const before = (await writes()).length;
      await file.setInputFiles({ name: 'wrong.pdf', mimeType: 'application/pdf', buffer: Buffer.from('bad') }); assert((await writes()).length === before, 'Invalid image uploaded');
      await file.setInputFiles({ name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lYQAAAAASUVORK5CYII=', 'base64') });
      await dialog.getByRole('button', { name: 'Replace picture', exact: true }).waitFor(); assert(!!(await lastWrite('rewards/1/image')), 'Upload missing');
      await dialog.getByRole('button', { name: 'Remove picture', exact: true }).click(); await dialog.getByRole('button', { name: 'Keep it', exact: true }).click(); assert((await lastWrite('rewards/1/image')).method === 'POST', 'Removed without confirmation');
      await dialog.getByRole('button', { name: 'Remove picture', exact: true }).click(); await dialog.getByRole('button', { name: 'Remove', exact: true }).click(); await dialog.getByText('No picture yet.', { exact: true }).waitFor(); assert((await lastWrite('rewards/1/image')).method === 'DELETE', 'Removal missing'); await page.keyboard.press('Escape');
    });
    await check('server field errors keep the reward draft, then retry succeeds', async () => {
      await state({ fieldFail: { name: ['Name is invalid.'] } }); await input('Reward name').fill('Retry reward'); await button('Save reward').click(); await page.getByText('Give the reward a name, up to 191 characters.', { exact: true }).waitFor(); assert(await input('Reward name').inputValue() === 'Retry reward', 'Draft lost on 422');
      await state({ fieldFail: null }); await button('Save reward').click(); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor();
    });
    await check('pending save disables repeated submits and navigation', async () => {
      await go('?reward=1'); await state({ slow: true }); await number('Points per claim').fill('650'); const count = (await writes()).filter(r => r.path === 'rewards/1').length; await button('Save reward').click(); assert(await button('Save reward').isDisabled(), 'Save stayed enabled');
      await page.getByRole('link', { name: '← All points rewards', exact: true }).click(); assert(page.url().includes('reward=1'), 'Navigation escaped pending write'); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor(); await state({ slow: false }); assert((await writes()).filter(r => r.path === 'rewards/1').length === count + 1, 'Duplicate writes');
    });
    await check('missing reward address recovers to the catalogue', async () => { await go('?reward=99999'); await page.getByText('This record is no longer available.', { exact: true }).waitFor(); await page.getByRole('link', { name: '← All points rewards', exact: true }).click(); await page.getByRole('heading', { name: 'Points rewards', exact: true }).waitFor(); });
    await check('offers filter by brand, code and ended status', async () => {
      await go('?tab=offers'); await select('Brand').first().selectOption('2'); await page.locator('[data-record="offer-2"]').waitFor(); await rows(1);
      await go('?tab=offers&q=RELAX15'); await rows(1);
      await go('?tab=offers'); await button('View ended offers →').click(); await page.locator('[data-record="offer-4"]').waitFor(); await rows(1);
    });
    await check('offer draft guards list selection; discard resets the inline form', async () => {
      const writeCount = (await writes()).length;
      await go('?tab=offers&selected=1'); await input('Offer name').fill('Unsaved offer'); await button('Select Weekend stay').click(); await page.getByRole('dialog').waitFor(); await button('Keep editing').click(); assert(await input('Offer name').inputValue() === 'Unsaved offer', 'Offer draft lost');
      await button('Select Weekend stay').click(); await button('Discard changes').click(); await page.waitForFunction(() => document.querySelector('.l-rb-offer-editor input').value === 'Weekend stay', undefined, { timeout: 8000 }); assert((await writes()).length === writeCount, 'Selection or discard submitted the form');
    });
    await check('offer edits preserve brand, tiers, caps, code, featured flag and date-only contract', async () => {
      await go('?tab=offers&selected=1'); await input('Offer name').fill('Offer updated'); await select('Brand').last().selectOption('every'); await select('Kind').selectOption('fixed_amount'); await number('Value').fill('20'); await input('Offer code').fill('fall-20');
      await page.getByLabel('Starts', { exact: true }).fill('2026-10-29'); await page.getByLabel('Ends', { exact: true }).fill('2026-12-31'); await select('Applies to').selectOption('stays'); await number('Total claims cap').fill('200'); await number('Per member').fill('2');
      await page.locator('.l-rb-level-picker summary').click(); await page.getByRole('checkbox', { name: 'Silver', exact: true }).uncheck(); await button('Featured: On').click(); await button('Save offer').click(); await page.getByText('Saved. Your catalogue is up to date.', { exact: true }).waitFor();
      const b = (await lastWrite('offers/1')).payload; assert(b.brand === 'every' && b.type === 'fixed_amount' && b.value === 20 && b.code === 'FALL-20' && b.start_date === '2026-10-29' && b.end_date === '2026-12-31' && b.usage_limit === 200 && b.per_member_limit === 2 && b.tier_ids.join() === '3' && b.is_featured === false, 'Offer payload mismatch');
    });
    await check('offer cancel restores the saved baseline', async () => { await input('Offer name').fill('Temporary'); await button('Cancel changes').click(); assert(await input('Offer name').inputValue() === 'Offer updated', 'Cancel baseline stale'); });
    await check('offer code collision retains all fields and recovers', async () => {
      await state({ fieldFail: { code: ['Already taken.'] } }); await input('Offer code').fill('TAKEN'); await button('Save offer').click(); await page.locator('[aria-invalid=true]').first().waitFor(); assert(await input('Offer name').inputValue() === 'Offer updated', 'Offer draft lost on failure'); await state({ fieldFail: null }); await input('Offer code').fill('UNIQUE'); await button('Save offer').click(); await page.getByText('Saved. Your catalogue is up to date.', { exact: true }).waitFor();
    });
    await check('new offer validates dates and description then creates without redeeming', async () => {
      await go('?tab=offers&offer=new'); await input('Offer name').fill('New offer fixture'); await number('Value').fill('10'); await page.getByLabel('Starts', { exact: true }).fill('2026-12-01'); await page.getByLabel('Ends', { exact: true }).fill('2026-11-01'); const before = (await writes()).length; await button('Save offer').click(); await page.getByRole('dialog').waitFor(); assert((await writes()).length === before, 'Invalid offer posted');
      await page.getByRole('dialog').getByRole('textbox', { name: 'Description', exact: true }).fill('A member offer.'); await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click(); await page.getByLabel('Ends', { exact: true }).fill('2026-12-31'); await button('Save offer').click(); await page.getByText('Saved. Your catalogue is up to date.', { exact: true }).waitFor(); const b = (await lastWrite('offers')).payload; assert(b.tier_ids === null && b.usage_limit === null && b.per_member_limit === null && !('is_active' in b) && b.brand === 'every', 'Create defaults mismatch');
    });
    await check('benefits filter by fulfillment, level, assignment state and search', async () => {
      await go('?tab=benefits'); await select('Delivery').selectOption('automatic'); await page.locator('[data-record="benefit-1"]').waitFor(); await rows(2);
      await select('Level').selectOption('2'); await page.locator('[data-record="benefit-3"]').waitFor(); await rows(1);
      await go('?tab=benefits&status=unassigned'); await page.locator('[data-record="benefit-6"]').waitFor(); await rows(1);
    });
    await check('benefit editing preserves immutable code and fulfillment values', async () => {
      await go('?tab=benefits&selected=1'); await button('Edit benefit').click(); const d = page.getByRole('dialog'); assert(await d.getByRole('textbox', { name: 'Code', exact: true }).count() === 0, 'Code became editable'); await d.getByRole('textbox', { name: 'Name', exact: true }).fill('Stay benefit updated'); await d.getByRole('combobox', { name: 'How it is given', exact: true }).selectOption('automatic'); await d.getByRole('button', { name: 'Save benefit', exact: true }).click(); await d.waitFor({ state: 'hidden' }); assert((await lastWrite('program/benefits/1')).payload.name === 'Stay benefit updated', 'Benefit update missing');
    });
    await check('assignment opens on the selected benefit and updates only the chosen level', async () => {
      await go('?tab=benefits&selected=6'); await button('Assign to a level').click(); await page.getByRole('dialog').getByRole('button', { name: 'Gold', exact: true }).click(); const d = page.getByRole('dialog'); assert(await d.getByRole('combobox').first().inputValue() === '6', 'Wrong initial benefit');
      await d.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('percent_discount'); await d.getByRole('spinbutton').fill('101'); const before = (await writes()).length; await d.getByRole('button', { name: 'Add benefit', exact: true }).click(); assert((await writes()).length === before, 'Invalid assignment posted');
      await d.getByRole('spinbutton').fill('12'); await d.getByRole('combobox', { name: 'Applies to', exact: true }).selectOption('services'); await d.getByRole('textbox', { name: 'Wording shown to members', exact: true }).fill('Twelve percent on treatments'); await d.getByRole('button', { name: 'Add benefit', exact: true }).click(); await d.waitFor({ state: 'hidden' });
      const b = (await lastWrite('program/tiers/3/benefits')).payload; assert(b.benefit_id === 6 && b.value_type === 'percent_discount' && b.value_amount === 12 && b.applies_to === 'services', 'Assignment payload mismatch');
      const s = await state(); assert(s.program.tiers.find(t => t.id === 3).benefits.some(b => b.benefit_id === 6) && !s.program.tiers.find(t => t.id === 2).benefits.some(b => b.benefit_id === 6), 'Assignment affected another tier');
    });
    const result = { passed: passed.length, checks: passed, errors: (await state()).errors };
    assert(result.errors.length === 0, 'Page errors: ' + result.errors.join(', '));
    return result;
  } catch (error) {
    await page.screenshot({ path: 'C:/wamp64/www/Hexa-Tech/.git/rewards-browser-failure.png', fullPage: true });
    return { failedAfter: passed.length, passed, error: String(error), url: page.url(), page: (await page.locator('body').innerText()).slice(-5000) };
  }
}
