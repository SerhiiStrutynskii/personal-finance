import { expect, test } from '@playwright/test';
import { register } from './helpers.ts';

test('рахунок із поточним залишком одразу показує цей баланс', async ({ page }) => {
  await register(page);
  await page.getByRole('link', { name: 'Рахунки' }).click();
  await page.getByRole('button', { name: 'Додати рахунок' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Картка');

  // Некоректна сума не дає створити рахунок.
  const balance = dialog.getByLabel(/Поточний залишок, UAH/);
  await balance.fill('-5');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog.getByText('Сума не може бути відʼємною')).toBeVisible();

  await balance.fill('1 000,50');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('account-balance').first()).toContainText('1 000,50');
});
