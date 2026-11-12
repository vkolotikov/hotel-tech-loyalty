async (page) => {
  page.setDefaultTimeout(5000);
  await page.goto('http://127.0.0.1:5837/profile');
  await page.getByLabel('Name', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  for (const label of ['Current password', 'New password', 'Confirm new password']) {
    await page.getByLabel(label, { exact: true }).waitFor();
  }
  await page.goto('http://127.0.0.1:5837/preferences');
  const notifications = page.getByRole('switch', { name: 'Notifications', exact: true });
  await notifications.click();
  await page.getByText(/Notifications (?:work in|could not connect)/).waitFor();
  if (await notifications.isDisabled()) throw Error('A failed connection made the notification choice impossible to switch off');
  await notifications.click();
  if (await notifications.isChecked()) throw Error('The notification preference did not switch off');
  return { checks: 6, names: ['account name has a programmatic label', 'current password has a programmatic label', 'new password has a programmatic label', 'password confirmation has a programmatic label', 'an unavailable notification connection does not trap the toggle', 'the off preference remains actionable'] };
}
