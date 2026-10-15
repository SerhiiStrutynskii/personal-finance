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

test('баланс рахунку змінюється коригуванням на фактичну суму', async ({ page }) => {
  await register(page);
  await page.getByRole('link', { name: 'Рахунки' }).click();
  await page.getByRole('button', { name: 'Додати рахунок' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Назва').fill('Готівка');
  await create.getByLabel(/Поточний залишок, UAH/).fill('500');
  await create.getByRole('button', { name: 'Додати' }).click();
  await expect(create).toBeHidden();

  await page.getByRole('button', { name: 'Змінити баланс' }).click();
  const dialog = page.getByRole('dialog');
  const balance = dialog.getByLabel('Фактичний баланс, UAH');
  await expect(balance).toHaveValue('500,00');

  await balance.fill('abc');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog.getByText('Некоректна сума, приклад: 1234,50')).toBeVisible();

  await balance.fill('-120,25');
  await expect(dialog.getByText(/Баланс зменшиться на 620,25/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('account-balance').first()).toContainText('-120,25');
});
