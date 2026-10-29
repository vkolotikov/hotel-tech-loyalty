// Local fixture only. All API reads and writes are intercepted; never run against production.
async (page) => {
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/rewards-benefits/';
  const brands = { list: [{ id: 1, name: 'Northstar Spa', is_default: true }, { id: 2, name: 'Northstar Hotel', is_default: false }, { id: 3, name: 'Northstar Café', is_default: false }], default: 1 };
  const image = { max_kb: 5120, max_edge: 4096, types: ['image/jpeg', 'image/png', 'image/webp'] };
  const reward = (id, name, cost, more = {}) => ({ id, brand_id: 1, name, description: 'One freshly made coffee, on us.', terms: 'One coffee per member. Subject to café opening hours.', category: null, points_cost: cost, stock: null, per_member_limit: 1, discount_type: null, discount_value: null, applies_to: 'all', expires_at: null, is_active: true, image_url: null, redeemed: 0, fulfilled: 0, ...more });
  const catalogue = { rewards: [reward(1, 'Complimentary coffee', 500), reward(2, '10% off a service', 750, { discount_type: 'percent_discount', discount_value: 10, applies_to: 'services' }), reward(3, 'Welcome gift', 1000), reward(4, 'Complimentary breakfast', 1500), reward(5, 'Weekend upgrade', 2500, { is_active: false }), reward(6, 'Summer reward', 1000, { expires_at: '2026-08-31T20:59:00Z' })], options: { discount_types: ['percent_discount', 'fixed_amount'], applies_to: ['all', 'services', 'stays'], image, brands } };
  const offer = (id, title, more = {}) => ({ id, brand_id: 1, title, description: 'Show eligible services, dates and usage limits before the offer is used.', type: 'discount', value: 15, code: 'RELAX15', applies_to: 'services', tier_ids: [2, 3], start_date: '2026-10-28', end_date: '2026-11-30', usage_limit: 100, times_used: 4, per_member_limit: 1, is_active: true, is_featured: true, image_url: null, state: 'live', ...more });
  const offers = { offers: [offer(1, 'Midweek reset'), offer(2, 'Weekend stay', { brand_id: 2, type: 'fixed_amount', value: 20, code: null, applies_to: 'stays', start_date: '2026-11-06', end_date: '2026-11-08', state: 'upcoming', is_featured: false }), offer(3, 'Member dining', { brand_id: 3, value: 10, code: null, start_date: '2026-12-01', end_date: '2026-12-31', state: 'upcoming', is_featured: false }), offer(4, 'Summer offer', { end_date: '2026-08-31', state: 'ended' }), offer(5, 'Paused offer', { is_active: false, state: 'off' })], options: { types: ['discount', 'fixed_amount', 'bonus_points', 'points_multiplier', 'free_night', 'upgrade', 'cashback'], applies_to: ['all', 'services', 'stays'], image, brands: { ...brands, every: true } } };
  const benefit = (id, name, mode, more = {}) => ({ id, name, code: 'BENEFIT_' + id, description: null, category: 'other', fulfillment_mode: mode, is_active: true, sort_order: id, ...more });
  const benefits = [benefit(1, 'Stay discount', 'automatic', { category: 'discount', description: 'Your membership discount is applied to eligible bookings.' }), benefit(2, 'Welcome drink', 'on_request'), benefit(3, 'Service discount', 'automatic', { category: 'discount' }), benefit(4, 'Priority booking', 'pms_linked'), benefit(5, 'Late checkout', 'staff_approved'), benefit(6, 'Spa voucher', 'voucher')];
  const assignment = (id, benefitId, more = {}) => ({ id, benefit_id: benefitId, name: benefits.find(b => b.id === benefitId).name, category: 'other', value: null, value_type: 'text', value_amount: null, applies_to: 'all', ...more });
  const tier = (id, name, list) => ({ id, name, description: null, color: '#c9a227', min_points: id * 1000, min_nights: null, min_stays: null, min_spend: null, earn_rate: 1, is_active: true, sort_order: id, members: 10, benefits: list });
  const tiers = [tier(1, 'Bronze', [assignment(11, 2)]), tier(2, 'Silver', [assignment(21, 2), assignment(22, 3, { value_type: 'percent_discount', value_amount: 5, applies_to: 'services' }), assignment(23, 4)]), tier(3, 'Gold', [assignment(31, 1, { value_type: 'percent_discount', value_amount: 10, applies_to: 'stays' }), assignment(32, 2), assignment(33, 3, { value_type: 'percent_discount', value_amount: 10, applies_to: 'services' }), assignment(34, 4), assignment(35, 5)])];
  const program = { tiers, benefits, boosts: [], advice: [], options: { categories: ['accommodation', 'dining', 'wellness', 'transport', 'recognition', 'points', 'access', 'discount', 'other'], fulfillment_modes: ['automatic', 'staff_approved', 'pms_linked', 'voucher', 'on_request'], value_types: ['text', 'percent_discount', 'fixed_amount', 'points_multiplier', 'free_item'], applies_to: ['all', 'services', 'stays'], brands } };
  const can = { award: true, redeem: true, reverse: true, manage_program: true, manage_rewards: true, manage_members: true, view_insights: true, manage_campaigns: true, manage_app: true };
  const boot = { name: 'HexaTech Loyalty', organization: { id: 1, name: 'Northstar Club', industry: 'hotel' }, accent: null, venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-28', currency: 'EUR' }, features: { campaigns: true, wallet: true, push: true }, staff: { id: 1, name: 'Alex Morgan', role: 'manager', can }, programme: { on: true, progress_by: 'points', tiers, ways: { setup_done: true, stamps_enabled: true, checkin_enabled: true, desk_earn_enabled: false, cashback_enabled: false } }, counts: { members: 1248, requests_waiting: 1 } };
  const state = { boot, catalogue, offers, program, requests: [], errors: [], fail: '', writeFail: false, fieldFail: null, limited: false, slow: false, empty: false };
  await page.unrouteAll({ behavior: 'wait' });
  await page.context().setOffline(false);
  page.on('pageerror', e => state.errors.push(e.message));
  await page.context().addInitScript(() => {
    localStorage.setItem('admin_lang', 'en');
    localStorage.setItem('auth_token', 'rewards-local-fixture');
    localStorage.setItem('loyalty-auth', JSON.stringify({ state: { token: 'rewards-local-fixture', user: { id: 1, name: 'Alex Morgan', email: 'fixture@example.test', user_type: 'staff', language: 'en' }, staff: { role: 'manager' } }, version: 1 }));
    localStorage.setItem('loyalty:look', JSON.stringify({ theme: 'dark', rail: 'full' }));
  });
  await page.route('**/manifest.webmanifest', route => route.fulfill({ contentType: 'application/manifest+json', body: '{"name":"Local test"}' }));
  await page.route('**/storage/rewards-fixture.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lYQAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.split('/admin/loyalty/')[1] || url.pathname, method = request.method();
    let payload = null; try { payload = request.postDataJSON() } catch {}
    if (path === '__fixture') { if (payload) Object.assign(state, payload); return route.fulfill({ contentType: 'application/json', body: JSON.stringify(state) }); }
    state.requests.push({ path, query: url.search, method, payload });
    if (state.slow && method !== 'GET') await new Promise(r => setTimeout(r, 2000));
    let body = {}, status = 200;
    const fail = code => { status = code; body = { error: code === 403 ? 'forbidden' : code === 404 ? 'not_found' : 'unavailable' } };
    if (state.fail === path) fail(503);
    else if (method !== 'GET' && state.limited) fail(403);
    else if (method !== 'GET' && state.writeFail) fail(503);
    else if (method !== 'GET' && state.fieldFail) { status = 422; body = { message: 'Invalid fields', errors: state.fieldFail }; }
    else if (path === 'bootstrap') { body = structuredClone(state.boot); if (state.limited) Object.keys(body.staff.can).forEach(k => body.staff.can[k] = false); }
    else if (path === 'rewards' && method === 'GET') { body = structuredClone(state.catalogue); if (state.empty) body.rewards = []; }
    else if (path === 'offers' && method === 'GET') { body = structuredClone(state.offers); if (state.empty) body.offers = []; }
    else if (path === 'program' && method === 'GET') { body = structuredClone(state.program); if (state.empty) body.benefits = []; }
    else if (/^(rewards|offers)(\/\d+)?$/.test(path)) {
      const [owner, rawId] = path.split('/'), key = owner === 'rewards' ? 'reward' : 'offer', list = owner === 'rewards' ? state.catalogue.rewards : state.offers.offers;
      let row = rawId ? list.find(r => r.id === Number(rawId)) : (owner === 'rewards' ? reward(100 + list.length, '', 1) : offer(100 + list.length, ''));
      if (!row) fail(404); else {
        Object.assign(row, payload); if (payload.brand !== undefined) row.brand_id = payload.brand === 'every' ? null : payload.brand;
        if (owner === 'rewards' && row.expires_at && !row.expires_at.endsWith('Z')) row.expires_at = row.expires_at + ':00+02:00';
        if (owner === 'offers') row.state = !row.is_active ? 'off' : row.end_date < boot.venue.today ? 'ended' : row.start_date > boot.venue.today ? 'upcoming' : 'live';
        if (!rawId) list.push(row); body = { [key]: row };
      }
    } else if (/^(rewards|offers)\/\d+\/image$/.test(path)) {
      const [owner, id] = path.split('/'), list = owner === 'rewards' ? state.catalogue.rewards : state.offers.offers, row = list.find(r => r.id === Number(id));
      row.image_url = method === 'DELETE' ? null : '/storage/rewards-fixture.png'; body = { image_url: row.image_url };
    } else if (/^program\/benefits(\/\d+)?$/.test(path)) {
      const id = Number(path.split('/')[2]); let row = state.program.benefits.find(b => b.id === id);
      if (method === 'POST') { row = benefit(100 + state.program.benefits.length, '', 'automatic'); state.program.benefits.push(row); }
      if (!row) fail(404); else if (method === 'DELETE') { state.program.benefits = state.program.benefits.filter(b => b.id !== id); state.program.tiers.forEach(t => t.benefits = t.benefits.filter(b => b.benefit_id !== id)); body = { removed: { tiers: 0 } }; }
      else { Object.assign(row, payload); body = { benefit: row }; }
    } else if (/^program\/benefits\/\d+\/removal$/.test(path)) {
      const row = state.program.benefits.find(b => b.id === Number(path.split('/')[2])); body = { removal: { benefit: row, tiers: state.program.tiers.filter(t => t.benefits.some(b => b.benefit_id === row.id)).map(t => t.name), waiting: 0, requests: 0 } };
    } else if (/^program\/tiers\/\d+\/benefits$/.test(path)) {
      const tier = state.program.tiers.find(t => t.id === Number(path.split('/')[2])), b = state.program.benefits.find(b => b.id === payload.benefit_id), current = tier.benefits.find(v => v.benefit_id === b.id);
      const row = { id: current?.id ?? 100 + tier.benefits.length, name: b.name, category: b.category, ...payload }; tier.benefits = [...tier.benefits.filter(v => v.benefit_id !== b.id), row]; body = { tier_benefit: row };
    } else if (path === 'places') body = { places: [], options: {} };
    else if (path === 'redemptions') body = { redemptions: [], counts: { pending: 0 }, total: 0, page: 1, pages: 1 };
    else if (path === 'referrals') body = { referrals: [], figures: { total: 0, rewarded: 0, pending: 0, points_paid: 0 }, total: 0, page: 1, pages: 1 };
    else if (path === 'start') body = { done: 7, total: 7, steps: [] };
    else if (path === 'requests') body = { requests: [], counts: { waiting: 0, approved: 0, done: 0 }, total: 0, page: 1, pages: 1 };
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  for (const [name, query] of [['points', ''], ['edit-reward', '?reward=1'], ['offers', '?tab=offers'], ['benefits', '?tab=benefits']]) {
    await page.goto('http://127.0.0.1:5173/loyalty/rewards' + query);
    await page.locator('.l-rb-preview').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: root + 'render-' + name + '.png', fullPage:false });
  }
  return { errors: state.errors, screens: 4, reads: state.requests.filter(r => r.method === 'GET').map(r => r.path) };
}
