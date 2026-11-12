async (page) => {
  page.setDefaultTimeout(5000);
  let release;
  const response = new Promise(done => { release = done; });
  await page.route('**/api/v1/auth/logout', async route => { await response; await route.fulfill({ json: { ok: true }, headers: { 'access-control-allow-origin': '*' } }); });
  const user = { id: 2, name: 'Member B', email: 'b@example.test', user_type: 'member', phone: '', language: 'en', date_of_birth: null };
  await page.route('**/api/v1/auth/login', route => route.fulfill({ json: { token: 'fixture-member-b-session', user }, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('http://127.0.0.1:5837/more');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByTestId('action-popup').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).waitFor();
  await page.evaluate(async user => fetch('/__fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ member: { name: user.name }, user }) }), user);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Member B', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const name = page.getByLabel('Name', { exact: true });
  await name.fill('Member B unsaved draft');
  const finished = page.waitForResponse('**/api/v1/auth/logout');
  release();
  await (await finished).finished();
  // A negative assertion needs an observation window after the old completion has run and React has painted.
  await page.waitForTimeout(400);
  if (new URL(page.url()).pathname !== '/profile') throw Error('An older sign-out navigated the new member away');
  if (await name.inputValue() !== 'Member B unsaved draft') throw Error('An older sign-out cleared the new member cache/look and discarded their draft');
  return { checks: 2, names: ['older sign-out completion preserves the new member route', 'older sign-out completion preserves the new member profile draft'] };
}
