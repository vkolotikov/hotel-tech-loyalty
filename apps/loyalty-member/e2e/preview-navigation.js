async (page) => {
  page.setDefaultTimeout(5000);
  const endpoint = '**/api/v1/member/portal/events';
  const emptyEvents = route => route.fulfill({ json: { upcoming: [], attended: [] }, headers: { 'access-control-allow-origin': '*' } });
  const patch = value => page.evaluate(async value => fetch('/__fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }), value);
  await page.route(endpoint, emptyEvents);
  try {
    // The bootstrap flag means "an eligible event is coming up", not that the member has an Events feature.
    await patch({ capabilities: { events: false } });
    await page.goto('http://127.0.0.1:5837/');
    const events = page.getByRole('button', { name: 'Events', exact: true });
    await events.waitFor();
    if (await page.getByRole('button', { name: 'Card', exact: true }).count() !== 1) throw Error('The central card action moved out of the dock');
    await events.click();
    await page.getByText('Nothing is planned right now.', { exact: true }).waitFor();
    if (new URL(page.url()).pathname !== '/events') throw Error('An empty calendar redirected away from Events');
    if (await page.getByRole('button', { name: 'Sign up', exact: true }).count()) throw Error('An unavailable event exposed registration');
    await page.reload();
    await page.getByText('Nothing is planned right now.', { exact: true }).waitFor();
    if (new URL(page.url()).pathname !== '/events') throw Error('A direct link to an empty calendar redirected');
    if (await page.getByRole('button', { name: 'Events', exact: true }).getAttribute('aria-selected') !== 'true') throw Error('Events did not remain selected');
    return { checks: 6, names: ['calendar remains in the five-place dock without upcoming events or history', 'central card action stays present', 'empty calendar opens', 'disabled events expose no registration', 'empty calendar survives a direct link/reload', 'Events selection remains accessible'] };
  } finally {
    await page.unroute(endpoint, emptyEvents);
    await patch({ capabilities: { events: true } });
    await page.goto('http://127.0.0.1:5837/');
  }
}
