import { expect, test } from '@playwright/test';
import { addAccount, addExpenseCategory, register } from './helpers.ts';

test('витрата понад ліміт робить рядок категорії червоним і не блокує наступні', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');

  // Створюємо бюджет поточного місяця.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await expect(page.getByText(/Бюджету на .+ ще немає/)).toBeVisible();
  await page.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByRole('button', { name: 'Додати ліміт' })).toBeVisible();

  // Ліміт 100 грн на «Продукти».
  await page.getByRole('button', { name: 'Додати ліміт' }).click();
  const limitDialog = page.getByRole('dialog');
  await limitDialog.getByLabel('Ліміт, UAH').fill('100');
  await limitDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(limitDialog).toBeHidden();

  const row = page.getByTestId('expense-line').filter({ hasText: 'Продукти' });
  await expect(row).toHaveAttribute('data-status', 'neutral');
  await expect(row).toContainText('Залишок 100,00');

  // Витрата 150 грн перевищує ліміт на 50 грн.
  await row.getByRole('button', { name: 'витрата' }).click();
  const expenseDialog = page.getByRole('dialog');
  await expect(expenseDialog.getByRole('heading', { name: 'Нова витрата' })).toBeVisible();
  await expenseDialog.getByLabel('Сума, UAH').fill('150');
  await expenseDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(expenseDialog).toBeHidden();

  await expect(row).toHaveAttribute('data-status', 'over');
  // Статус передано не лише кольором: є текст і іконка.
  await expect(row).toContainText('Перевищено на 50,00');
  await expect(row.locator('svg.lucide-triangle-alert')).toBeVisible();

  // Рамка рядка справді має колір токена --status-over.
  const colors = await row.evaluate((element) => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--status-over)';
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { border: getComputedStyle(element).borderTopColor, expected };
  });
  expect(colors.border).toBe(colors.expected);

  await expect(page.getByText('150,00').first()).toBeVisible();

  // Перевищений ліміт не блокує нові витрати в цій категорії.
  await row.getByRole('button', { name: 'витрата' }).click();
  await expenseDialog.getByLabel('Сума, UAH').fill('25');
  await expenseDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(expenseDialog).toBeHidden();
  await expect(row).toHaveAttribute('data-status', 'over');
  await expect(row).toContainText('Перевищено на 75,00');
  await page.screenshot({ path: 'test-results/budget-over-limit.png', fullPage: true });
});
