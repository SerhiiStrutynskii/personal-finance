import { expect, test, type Page } from '@playwright/test';

async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Імʼя').fill('Тест');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Пароль').fill('e2e-password-123');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();
}

async function addAccount(page: Page, name: string) {
  await page.getByRole('link', { name: 'Рахунки' }).click();
  await page.getByRole('button', { name: 'Додати рахунок' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name).first()).toBeVisible();
}

async function addExpenseCategory(page: Page, name: string) {
  await page.getByRole('link', { name: 'Категорії' }).click();
  await page.getByRole('button', { name: 'Додати категорію' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
}

test('витрата понад ліміт робить рядок категорії червоним', async ({ page }) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');

  // Створюємо бюджет поточного місяця.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await expect(page.getByText(/Бюджету на .+ ще немає/)).toBeVisible();
  await page.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByTestId('budget-status')).toHaveText('Активний');

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
  await page.screenshot({ path: 'test-results/budget-over-limit.png', fullPage: true });
});
