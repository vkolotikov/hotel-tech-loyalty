// Run after insights.browser.js. Every API call is intercepted by its local fixture.
async page => {
  const base = new URL(page.url()).origin;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):(5173|5810)$/.test(base)) throw Error('Local fixtures required');
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/insights-layout/';
  const checks = [], sizes = [];
  const ok = (value, name) => { if (!value) throw Error(name); checks.push(name); };
  const fixture = body => page.evaluate(async body => (await fetch('/api/v1/admin/loyalty/__fixture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), body);
  const initial = await fixture({});
  const load = async report => { await fixture({ report }); await page.goto(base + '/loyalty/insights'); await page.locator('.l-in-level-card').waitFor(); await page.evaluate(() => document.fonts.ready); };
  const example = structuredClone(initial.report);
  example.snapshot_date = '2026-10-29';
  example.tiers = { total: 184, none: 0, rows: ['Bronze', 'Client', 'Member', 'Learner', 'Silver', 'Plus', 'Scholar', 'Preferred', 'Gold', 'Alumni'].map((name, i) => ({ id: i + 1, name, members: name === 'Bronze' ? 179 : name === 'Silver' ? 3 : name === 'Gold' ? 2 : 0 })) };
  await load(example);
  const card = page.locator('.l-in-level-card'), breakdown = page.locator('.l-in-level-breakdown'), summary = page.locator('.l-in-empty-levels > summary');
  ok(await breakdown.locator('li').count() === 3, 'only populated levels occupy the main legend');
  ok((await breakdown.innerText()).includes('97.3%') && (await breakdown.innerText()).includes('1.6%') && (await breakdown.innerText()).includes('1.1%'), 'shares retain the exact 184-member denominator');
  ok((await page.locator('.l-in-donut').innerText()).includes('184'), 'donut retains the complete snapshot total');
  ok(await page.locator('.l-in-donut svg circle').count() === 4, 'zero-member levels do not draw misleading arcs');
  ok(await summary.innerText() === 'Levels with no members (7)', 'empty levels are explicitly accounted for');
  await summary.focus(); await page.keyboard.press('Enter');
  ok(await page.locator('.l-in-empty-levels[open] li').count() === 7, 'keyboard disclosure exposes all seven empty levels');
  ok((await page.locator('.l-in-empty-levels').innerText()).includes('Alumni'), 'last empty level remains available');
  ok((await page.locator('.l-in-trend').boundingBox()).height < 450, 'opening empty levels does not stretch the activity chart');
  await page.screenshot({ path: root + 'render-expanded.png', fullPage: true });
  await summary.focus(); await page.keyboard.press('Enter');
  await summary.evaluate(e => e.blur());
  for (const width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForFunction(() => [...document.querySelectorAll('.l-in-trend-svg,.l-in-points-svg')].every(e => Math.abs(e.getBoundingClientRect().width - e.viewBox.baseVal.width) < 1));
    const box = await card.boundingBox(); sizes.push({ width, cardHeight: box.height, cardWidth: box.width });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page fits ' + width + 'px');
    ok(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'level content fits ' + width + 'px');
    ok(box.height < 500, 'membership card stays compact at ' + width + 'px');
    if ([1440, 390, 320].includes(width)) { await page.screenshot({ path: root + 'render-' + width + '.png', fullPage: true }); await card.screenshot({ path: root + 'card-' + width + '.png' }); }
  }
  const many = structuredClone(example);
  many.tiers = { total: 300, none: 0, rows: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: 'Membership level ' + (i + 1), members: 10 })) };
  await page.setViewportSize({ width: 1440, height: 1080 }); await load(many);
  ok((await card.boundingBox()).height < 500, '30 populated levels do not grow the card');
  ok(await breakdown.getAttribute('tabindex') === '0', 'long breakdown is keyboard scrollable');
  await breakdown.focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('.l-in-level-breakdown').scrollTop > 0);
  ok(await breakdown.evaluate(e => e.scrollTop > 0), 'keyboard reaches the end of a long breakdown');
  ok(await breakdown.locator('li').count() === 30, 'all populated levels are retained');
  await page.screenshot({ path: root + 'render-many-levels.png', fullPage: true });
  const long = structuredClone(example); long.tiers.rows[0].name = 'A very long membership level name for a professional learning programme';
  await page.setViewportSize({ width: 320, height: 1080 }); await load(long);
  ok(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'long level names wrap without horizontal overflow');
  const unassigned = structuredClone(example); unassigned.tiers.none = 16; unassigned.tiers.total = 200;
  await load(unassigned);
  ok((await breakdown.innerText()).includes('No level') && (await breakdown.innerText()).includes('8%'), 'members without a level remain in the distribution');
  const empty = structuredClone(example); empty.tiers.rows.forEach(row => row.members = 0); empty.tiers.total = 0;
  await load(empty);
  ok((await card.innerText()).includes('No members in this snapshot yet.'), 'empty snapshot has an explanation');
  ok(!(await card.innerText()).match(/NaN|Infinity/), 'empty snapshot has no invalid percentage');
  await summary.click(); ok(await page.locator('.l-in-empty-levels[open] li').count() === 10, 'empty snapshot still exposes every configured level');
  await page.screenshot({ path: root + 'render-empty.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 }); await load(example);
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Light', exact: true }).click(); await page.keyboard.press('Escape');
  await page.screenshot({ path: root + 'render-light.png', fullPage: true });
  for (const lang of ['ru', 'de', 'fr', 'es']) {
    await page.getByRole('button', { name: /^(Settings|Настройки|Einstellungen|Réglages|Configuración)$/ }).click();
    await page.getByRole('combobox', { name: /Language|Язык|Sprache|Langue|Idioma/ }).selectOption(lang); await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 1080 });
    ok(!(await summary.innerText()).includes('Levels with no members'), 'disclosure translated to ' + lang);
    await summary.click(); ok(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'expanded mobile layout fits ' + lang); await summary.click();
    await page.setViewportSize({ width: 1440, height: 1080 });
  }
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click(); await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('en'); await page.getByRole('button', { name: 'Dark', exact: true }).click(); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1080 }); await load(initial.report);
  const state = await fixture({});
  ok(state.requests.every(r => r.method === 'GET'), 'layout interaction only reads existing APIs');
  ok(state.errors.length === 0, 'no browser runtime errors');
  return { passed: checks.length, checks, sizes, errors: state.errors };
}
