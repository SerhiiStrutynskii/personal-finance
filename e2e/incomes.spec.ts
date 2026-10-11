import { expect, test } from '@playwright/test';
import { addAccount, register } from './helpers.ts';

test('джерело «Зарплата» дає очікуване надходження, яке стає отриманим', async ({ page }) => {
  await register(page);
  await addAccount(page, 'Картка');

  // Джерело «Зарплата»: 45 000 грн щомісяця 5-го.
  await page.getByRole('link', { name: 'Доходи' }).click();
  await page.getByRole('link', { name: 'Джерела доходу' }).click();
  await page.getByRole('button', { name: 'Додати джерело' }).click();
  const sourceDialog = page.getByRole('dialog');
  await sourceDialog.getByLabel('Назва').fill('Зарплата');
  await sourceDialog.getByLabel('Сума одного надходження, UAH').fill('45000');
  await sourceDialog.getByLabel('День місяця').fill('5');
  // Прев'ю показує три найближчі дати, усі 5-го числа.
  await expect(sourceDialog.getByTestId('source-preview')).toContainText(
    /Найближчі надходження: 05\.\d{2}\.\d{4}, 05\.\d{2}\.\d{4}, 05\.\d{2}\.\d{4}/,
  );
  await sourceDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(sourceDialog).toBeHidden();
  await expect(page.getByTestId('income-source')).toContainText('Щомісяця 5-го');

  // У наступному місяці 5-те число ще попереду, тож надходження очікується.
  await page.getByRole('link', { name: 'До доходів' }).click();
  await page.getByRole('button', { name: 'Наступний місяць' }).click();
  const occurrence = page.getByTestId('income-occurrence').filter({ hasText: 'Зарплата' });
  await expect(occurrence).toHaveAttribute('data-status', 'pending');
  await expect(occurrence).toContainText('Очікується 05.');
  const summary = page.locator('[data-slot=card]').first();
  await expect(summary).toContainText('Заплановано45 000,00');
  await expect(summary).toContainText('Ще очікується45 000,00');

  // «Отримано»: форма вже містить заплановану суму.
  await occurrence.getByRole('button', { name: 'Отримано' }).click();
  const receiveDialog = page.getByRole('dialog');
  await expect(receiveDialog.getByLabel('Сума, UAH')).toHaveValue('45000,00');
  await receiveDialog.getByRole('button', { name: 'Отримано' }).click();
  await expect(receiveDialog).toBeHidden();

  // Статус передано не лише кольором: є текст і іконка.
  await expect(occurrence).toHaveAttribute('data-status', 'received');
  await expect(occurrence).toContainText('Отримано');
  await expect(occurrence.locator('svg.lucide-check')).toBeVisible();
  await expect(summary).toContainText('Ще очікується0,00');

  await page.screenshot({ path: 'test-results/incomes-received.png', fullPage: true });

  // Гроші надійшли сьогодні, тому сума отриманого — у поточному місяці.
  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(summary).toContainText('Отримано45 000,00');
});
