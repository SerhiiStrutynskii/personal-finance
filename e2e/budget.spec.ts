import { expect, test } from '@playwright/test';
import { addAccount, addExpenseCategory, register } from './helpers.ts';

test('видаток понад ліміт робить рядок категорії червоним; минулий місяць — лише перегляд', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');

  // Створюємо бюджет поточного місяця.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await expect(page.getByText(/Бюджету на .+ ще немає/)).toBeVisible();
  await page.getByRole('button', { name: 'Створити' }).click();

  // Ліміт 100 грн на «Продукти».
  await page.getByRole('button', { name: 'Додати ліміт' }).click();
  const limitDialog = page.getByRole('dialog');
  await limitDialog.getByLabel('Ліміт, UAH').fill('100');
  await limitDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(limitDialog).toBeHidden();

  const row = page.getByTestId('expense-line').filter({ hasText: 'Продукти' });
  await expect(row).toHaveAttribute('data-status', 'neutral');
  await expect(row).toContainText('Залишок 100,00');
  // У рядках категорій видатки не додаються.
  await expect(row.getByRole('button', { name: /витрата|видаток/i })).toHaveCount(0);

  // «+ Видаток» у шапці відкриває ту саму модалку, що й на сторінці видатків.
  const addExpense = page.getByRole('button', { name: 'Видаток', exact: true });
  const expenseDialog = page.getByRole('dialog');
  async function spend(amount: string) {
    await addExpense.click();
    await expect(expenseDialog.getByRole('heading', { name: 'Нова витрата' })).toBeVisible();
    await expenseDialog.getByLabel('Сума, UAH').fill(amount);
    // другий список у формі — категорія (перший — рахунок)
    await expenseDialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Продукти' }).click();
    await expenseDialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(expenseDialog).toBeHidden();
  }

  // Вибір дати обмежено поточним місяцем і сьогоднішнім днем.
  await addExpense.click();
  const dateInput = expenseDialog.getByLabel('Дата');
  const today = await dateInput.inputValue();
  await expect(dateInput).toHaveAttribute('max', today);
  await expect(dateInput).toHaveAttribute('min', `${today.slice(0, 8)}01`);
  await page.keyboard.press('Escape');
  await expect(expenseDialog).toBeHidden();

  // Видаток 150 грн перевищує ліміт на 50 грн.
  await spend('150');
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

  // Підсумок оновився.
  const summary = page.locator('[data-slot=card]').first();
  await expect(summary).toContainText('Витрати150,00');
  await page.screenshot({ path: 'test-results/budget-over-limit.png', fullPage: true });

  // Перевищений ліміт не блокує нові видатки в цій категорії.
  await spend('25');
  await expect(row).toContainText('Перевищено на 75,00');

  // Ліміт редагується прямо в рядку.
  await row.getByRole('button', { name: 'Змінити ліміт «Продукти»' }).click();
  await row.getByLabel('Ліміт «Продукти», UAH').fill('200');
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('data-status', 'neutral');
  await expect(row).toContainText('Залишок 25,00');

  // Минулий місяць: кнопки «+ Видаток» немає, створити бюджет не можна.
  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(page.getByTestId('budget-empty')).toContainText('не було');
  await expect(addExpense).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Створити' })).toHaveCount(0);

  // Сторінка витрат показує поточний місяць; у майбутнє гортати не можна.
  await page.getByRole('link', { name: 'Витрати' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Продукти' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Наступний місяць' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Додати', exact: true })).toBeVisible();

  // У попередньому місяці видатків немає, і додати їх туди не можна.
  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(page.getByText('За цей місяць витрат немає')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Продукти' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Додати', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Наступний місяць' })).toBeEnabled();
});
