import { expect, test } from '@playwright/test';
import { addAccount, addExpenseCategory, register } from './helpers.ts';

test('головна: кроки для нового користувача, видаток із головної й попередження про ліміт', async ({
  page,
}) => {
  await register(page);

  // Новий користувач бачить кроки, а не зведення.
  const setup = page.getByTestId('dashboard-setup');
  await expect(setup).toContainText('З чого почати');
  await expect(setup.getByRole('link', { name: 'Створіть рахунок' })).toBeVisible();
  await expect(page.getByTestId('dashboard-money')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Видаток', exact: true })).toHaveCount(0);

  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');

  // Після рахунку з'являється зведення; перший крок виконано.
  await page.getByRole('link', { name: 'Головна' }).click();
  await expect(setup.locator('li[data-done=true]')).toHaveCount(1);
  await expect(page.getByTestId('dashboard-money')).toContainText('Чисті активи');
  await expect(page.getByTestId('dashboard-attention')).toContainText('Усе під контролем');
  const plan = page.getByTestId('dashboard-plan').getByTestId('month-plan');
  await expect(plan).toHaveAttribute('data-state', 'none');
  await expect(plan).toContainText('немає бюджету');

  // Бюджет із лімітом 100 грн на «Продукти».
  await page.getByRole('link', { name: 'Бюджет', exact: true }).click();
  await page.getByRole('button', { name: 'Створити' }).click();
  await page.getByRole('button', { name: 'Додати ліміт' }).first().click();
  const limitDialog = page.getByRole('dialog');
  await limitDialog.getByLabel('Ліміт, UAH').fill('100');
  await limitDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(limitDialog).toBeHidden();
  // Доходів не заплановано, тож ліміт 100 грн уже більший за них.
  await expect(page.getByTestId('month-plan')).toHaveAttribute('data-state', 'deficit');
  await expect(page.getByTestId('month-plan')).toContainText(
    'заплановані витрати більші за доходи на 100,00',
  );

  // Видаток 150 грн із головної — тією самою модалкою, що й у розділі витрат.
  await page.getByRole('link', { name: 'Головна' }).click();
  await expect(plan).toHaveAttribute('data-state', 'deficit');
  await expect(plan).toContainText('Очікувані витрати100,00');
  await page.getByRole('button', { name: 'Видаток', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Нова витрата' })).toBeVisible();
  await dialog.getByLabel('Сума, UAH').fill('150');
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Продукти' }).click();
  await dialog.getByLabel('Опис').fill('Супермаркет');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();

  // Блок місяця оновився без перезавантаження сторінки.
  const month = page.getByTestId('dashboard-month');
  await expect(month).toContainText('Витрати150,00');
  await expect(month).toContainText('з 100,00');

  // Попередження передано не лише кольором: є іконка й текст.
  const attention = page.getByTestId('attention-item');
  await expect(attention).toHaveCount(1);
  await expect(attention).toHaveAttribute('data-kind', 'budget_over');
  await expect(attention).toContainText('Перевищено ліміт');
  await expect(attention).toContainText('Продукти');
  await expect(attention).toContainText('50,00');
  await expect(attention.locator('svg.lucide-triangle-alert')).toBeVisible();

  // Гроші й останні операції.
  await expect(page.getByTestId('dashboard-money')).toContainText('−150,00');
  const recent = page.getByTestId('recent-item');
  await expect(recent).toHaveCount(1);
  await expect(recent).toContainText('Супермаркет');
  await expect(recent).toContainText('−150,00');

  // Усі кроки виконано — блок із кроками зник.
  await expect(setup).toHaveCount(0);
  await page.screenshot({ path: 'test-results/dashboard.png' });

  // Попередження веде у свій розділ.
  await attention.getByRole('link', { name: 'Продукти' }).click();
  await expect(page.getByTestId('expense-line').filter({ hasText: 'Продукти' })).toHaveAttribute(
    'data-status',
    'over',
  );
});
