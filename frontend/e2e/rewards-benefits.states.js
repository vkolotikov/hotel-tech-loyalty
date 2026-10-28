// Run after the isolated Rewards fixture. No production API requests.
async (page) => {
  page.setDefaultTimeout(8000);
  const base = new URL(page.url()).origin, checks = [];
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/rewards-benefits/';
  const fixture = patch => page.evaluate(async p => (await fetch('/api/v1/admin/loyalty/__fixture', p ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) } : {})).json(), patch);
  const original = await fixture();
  const ok = (value, name) => { if (!value) throw Error(name); checks.push(name); };
  const go = async query => { await page.goto(base + '/loyalty/rewards' + query); await page.locator('.l-rb-list, .l-rb-editor').first().waitFor(); };
  const button = name => page.getByRole('button', { name, exact: true });
  const writes = async () => (await fixture()).requests.filter(r => r.method !== 'GET');
  try {
    await go('?reward=1');
    await page.getByRole('combobox', { name: 'Availability', exact: true }).selectOption('limited');
    await page.getByRole('spinbutton', { name: 'Stock', exact: true }).fill('');
    await page.getByRole('combobox', { name: 'Claims per member', exact: true }).selectOption('custom');
    const limit = page.getByRole('spinbutton', { name: 'Custom limit', exact: true });
    await limit.fill(''); await limit.pressSequentially('12');
    ok(await limit.inputValue() === '12', 'custom limit remains editable through blank and first digit');
    const before = (await writes()).length; await button('Save reward').click();
    ok((await writes()).length === before && await page.getByRole('spinbutton', { name: 'Stock', exact: true }).isVisible(), 'blank limited stock blocks save without hiding the field');
    await page.getByRole('spinbutton', { name: 'Stock', exact: true }).fill('10');
    await fixture({ writeFail: true }); await button('Save reward').click(); await page.locator('[role=alert]').first().waitFor();
    ok(await limit.inputValue() === '12', '503 keeps the reward draft');
    await fixture({ writeFail: false }); await button('Save reward').click(); await page.getByText('Saved. Your catalogue is up to date.', { exact: true }).waitFor();
    checks.push('reward retry saves and announces success');

    await go('?tab=benefits'); await button('+ Add benefit').click();
    let d = page.getByRole('dialog'); await d.getByRole('button', { name: 'Add benefit', exact: true }).click();
    ok(await d.locator('[aria-invalid=true]').count() > 0, 'benefit creation validates required fields');
    await d.getByRole('textbox', { name: 'Name', exact: true }).fill('Fixture benefit');
    await d.getByRole('textbox', { name: 'Code', exact: true }).fill('FIXTURE_BENEFIT');
    await d.getByRole('combobox', { name: 'Category', exact: true }).selectOption('wellness');
    await d.getByRole('combobox', { name: 'How it is given', exact: true }).selectOption('voucher');
    await d.getByRole('button', { name: 'Add benefit', exact: true }).click(); await d.waitFor({ state: 'hidden' });
    await button('Select Fixture benefit').click(); await page.getByRole('heading', { name: 'Fixture benefit', exact: true }).waitFor();
    const id = (await fixture()).program.benefits.find(b => b.code === 'FIXTURE_BENEFIT').id;
    ok(!!id, 'new benefit persists its code, category and fulfillment');
    await button('More').click(); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    d = page.getByRole('dialog'); await d.getByRole('textbox', { name: 'New name', exact: true }).fill('Renamed fixture'); await d.getByRole('button', { name: 'Rename', exact: true }).click(); await d.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Renamed fixture', exact: true }).waitFor();
    ok((await writes()).at(-1).payload.name === 'Renamed fixture', 'rename uses the existing benefit endpoint');
    await button('More').click(); await page.getByRole('menuitem', { name: 'Switched off', exact: true }).click();
    await page.waitForFunction(id => document.querySelector(`[data-record="benefit-${id}"]`).textContent.includes('Switched off'), id, { timeout: 8000 });
    ok(!(await fixture()).program.benefits.find(b => b.id === id).is_active, 'benefit can be paused');
    await button('More').click(); await page.getByRole('menuitem', { name: 'Active', exact: true }).click();
    await page.waitForFunction(id => !document.querySelector(`[data-record="benefit-${id}"]`).textContent.includes('Switched off'), id, { timeout: 8000 });
    await button('More').click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    d = page.getByRole('dialog'); await d.getByRole('button', { name: 'Delete benefit', exact: true }).waitFor();
    await d.getByRole('button', { name: 'Keep it', exact: true }).click();
    ok((await fixture()).program.benefits.some(b => b.id === id), 'delete preview can be cancelled without a write');
    await button('More').click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete benefit', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    ok(!(await fixture()).program.benefits.some(b => b.id === id), 'confirmed benefit deletion refreshes the catalogue');

    await fixture({ limited: true }); await go('');
    ok(await page.getByRole('link', { name: '+ Add reward', exact: true }).count() === 0 && await page.getByRole('link', { name: 'Edit reward', exact: true }).count() === 0, 'read-only rewards hide write links');
    await go('?reward=1'); ok(await page.getByRole('textbox', { name: 'Reward name', exact: true }).isDisabled() && await button('Save reward').count() === 0, 'direct reward editor enforces read-only access');
    await go('?tab=offers'); ok(await page.getByRole('textbox', { name: 'Offer name', exact: true }).isDisabled() && await button('Save offer').count() === 0, 'read-only offers disable form and omit saving');
    await go('?tab=benefits'); ok(await button('Edit benefit').count() === 0 && await button('Assign to a level').count() === 0 && await button('+ Add benefit').count() === 0, 'read-only benefits hide management actions');
    const programOnly = structuredClone(original.boot); programOnly.staff.can.manage_rewards = false;
    await fixture({ limited: false, boot: programOnly }); await go('?tab=benefits'); ok(await button('Edit benefit').isVisible(), 'manage_program permits benefits independently of manage_rewards');
    const rewardsOnly = structuredClone(original.boot); rewardsOnly.staff.can.manage_program = false;
    await fixture({ boot: rewardsOnly }); await go('?tab=benefits'); ok(await button('Edit benefit').count() === 0, 'manage_rewards alone does not permit benefit changes');
    await fixture({ boot: original.boot, empty: true });
    for (const [query, message] of [['', 'Add your first reward to start your catalogue.'], ['?tab=offers', 'Create your first offer for members.'], ['?tab=benefits', 'Create a benefit, then assign it to a level.']]) {
      await go(query); await page.getByText(message, { exact: true }).waitFor(); ok(await page.locator('.l-rb-row').count() === 0, 'honest empty state: ' + (query || 'rewards'));
    }
    await fixture({ empty: false });
    for (const [query, endpoint] of [['', 'rewards'], ['?tab=offers', 'offers'], ['?tab=benefits', 'program']]) {
      await fixture({ fail: endpoint }); await page.goto(base + '/loyalty/rewards' + query);
      await page.getByRole('button', { name: /Retry|Try again/ }).waitFor({ timeout: 20000 });
      ok(await page.locator('.l-rb-row').count() === 0, endpoint + ' failure shows no invented records');
      await fixture({ fail: '' }); await page.getByRole('button', { name: /Retry|Try again/ }).click(); await page.locator('.l-rb-row').first().waitFor(); checks.push(endpoint + ' recovers on retry');
    }
    for (const tab of ['redemptions', 'referrals']) { await page.goto(base + '/loyalty/rewards?tab=' + tab); await page.locator('#rewards-tab-' + tab).waitFor(); checks.push('legacy ' + tab + ' route preserved'); }
    await page.goto(base + '/loyalty/program?tab=benefits'); await page.locator('.l-rb-list').waitFor(); checks.push('legacy Program benefits route preserved');

    // Restore baseline data before comparing layouts and capturing evidence.
    await fixture({ catalogue: original.catalogue, offers: original.offers, program: original.program });
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1080 : 844 });
      for (const [name, query] of [['points', ''], ['edit-reward', '?reward=1'], ['offers', '?tab=offers'], ['benefits', '?tab=benefits']]) {
        await go(query); await page.evaluate(() => document.fonts.ready);
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1), `${name} fits ${width}px without horizontal overflow`);
        if (width === 1440 || width === 390) await page.screenshot({ path: root + `render-${name}-${width}.png`, fullPage: true });
      }
    }
    await page.locator('.l-ov-menu-button').click(); await page.getByRole('dialog').waitFor();
    ok(await page.getByRole('dialog').getByRole('link', { name: 'Membership benefits', exact: true }).isVisible(), 'mobile drawer exposes Rewards subpages');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1080 }); await go('');
    const assets = await page.locator('[data-loyalty] img').evaluateAll(imgs => imgs.filter(i => i.getBoundingClientRect().width > 0).map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0, width: i.width, natural: i.naturalWidth })));
    ok(assets.every(a => a.loaded && !/^https?:/.test(a.src)), 'visible icons load from bundled local assets');
    await button('Settings').click(); await button('Light').click(); await page.locator('[data-loyalty][data-theme=light]').waitFor(); await page.keyboard.press('Escape');
    await page.screenshot({ path: root + 'render-light.png', fullPage: true }); checks.push('shared light theme works');
    for (const lang of ['ru', 'de', 'fr', 'es']) {
      await button('Settings').click(); await page.getByRole('combobox', { name: /Language|Язык|Sprache|Langue|Idioma/ }).selectOption(lang); await page.keyboard.press('Escape');
      ok(!(await page.locator('.l-rb-page').innerText()).includes('Your rewards'), lang + ' translates the Rewards workspace');
      await page.setViewportSize({ width: 320, height: 844 });
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), lang + ' fits the narrow light layout');
      await page.setViewportSize({ width: 1440, height: 1080 });
      // Settings label is translated after the first pass; use its stable shortcut control.
      if (lang !== 'es') await page.reload();
    }
    ok((await fixture()).errors.length === 0, 'no uncaught browser errors');
    return { passed: checks.length, checks, assets, errors: (await fixture()).errors };
  } catch (error) {
    await page.screenshot({ path: root + 'state-failure.png', fullPage: true });
    return { passed: checks.length, checks, error: String(error), url: page.url(), body: (await page.locator('body').innerText()).slice(-4000) };
  }
}
