import { expect, test } from '@playwright/test';
import { register } from './helpers.ts';

test('довідник продуктів: додати з ціною, змінити ціну, дублікат, видалити', async ({ page }) => {
  await register(page);
  await page.getByRole('link', { name: 'Покупки' }).click();
  await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();
  await expect(page.getByText('Продуктів ще немає')).toBeVisible();

  // Новий продукт з одиницею й ціною за неї.
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Молоко');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'л', exact: true }).click();
  await dialog.getByLabel('Ціна за л, UAH').fill('42,5');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  const milk = page.getByTestId('product').filter({ hasText: 'Молоко' });
  await expect(milk.getByTestId('product-price')).toHaveText(/^42,50\s\S+ \/ л$/);

  // Ціна змінюється; форма відкривається з поточними значеннями.
  await page.getByRole('button', { name: 'Змінити «Молоко»' }).click();
  await expect(dialog.getByLabel('Ціна за л, UAH')).toHaveValue('42,50');
  await dialog.getByLabel('Ціна за л, UAH').fill('45,90');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
  await expect(milk.getByTestId('product-price')).toHaveText(/^45,90\s\S+ \/ л$/);

  // Та сама назва іншим регістром — той самий продукт.
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  await dialog.getByLabel('Назва').fill('молоко');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog.getByText('Продукт з такою назвою вже існує')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Видалити продукт «Молоко»' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Продуктів ще немає')).toBeVisible();
});
