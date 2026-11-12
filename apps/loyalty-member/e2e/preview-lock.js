async (page) => {
  page.setDefaultTimeout(5000);
  await page.goto('http://127.0.0.1:5837/?lock=1');
  await page.getByRole('button', { name: 'Unlock', exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Show my card', exact: true }).count()) throw Error('Cold launch exposed member controls while locked');
  if (await page.getByTestId('action-popup').count()) throw Error('A private native presentation remains mounted while locked');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  // Web has no device authentication: a refused/unavailable attempt must leave the member content unmounted.
  if (await page.getByRole('button', { name: 'Show my card', exact: true }).count()) throw Error('Unavailable authentication unlocked member content');
  await page.goto('http://127.0.0.1:5837/?out=1&lock=1');
  await page.getByLabel('Email', { exact: true }).waitFor();
  return { checks: 4, names: ['restored locked sessions require authentication on cold launch', 'private popups are unmounted while locked', 'unavailable authentication stays locked', 'signed-out users can still sign in'] };
}
