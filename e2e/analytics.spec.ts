import { expect, test, type Page } from '@playwright/test';
import { addAccount, addExpenseCategory, register } from './helpers.ts';

/** Додає видаток у категорії на сторінці «Витрати». */
async function addExpense(page: Page, amount: string, category: string) {
  await page.getByRole('link', { name: 'Витрати' }).click();
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Сума, UAH').fill(amount);
  // другий список у формі — категорія (перший — рахунок)
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: category }).click();
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
}

test('аналітика показує витрати за категоріями, дохід, витрати й різницю місяця', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');
  await addExpenseCategory(page, 'Транспорт');

  // Порожня аналітика: витрат і бюджету ще немає.
  await page.getByRole('link', { name: 'Аналітика' }).click();
  await expect(page.getByTestId('analytics-categories')).toContainText('витрат немає');
  await expect(page.getByTestId('analytics-overspending')).toContainText('немає бюджету');
  await expect(page.getByRole('button', { name: 'Наступний місяць' })).toBeDisabled();

  // Видатки у двох категоріях і разовий дохід.
  await addExpense(page, '300', 'Продукти');
  await addExpense(page, '100', 'Транспорт');
  await page.getByRole('link', { name: 'Доходи', exact: true }).click();
  await page.getByRole('button', { name: /разовий дохід/i }).click();
  const incomeDialog = page.getByRole('dialog');
  await incomeDialog.getByLabel('Назва').fill('Бонус');
  await incomeDialog.getByLabel('Сума, UAH').fill('900');
  await incomeDialog.getByRole('button', { name: /Зберегти|Додати/ }).click();
  await expect(incomeDialog).toBeHidden();

  // Бюджет із лімітом 200 грн на «Продукти» — його перевищено на 100 грн.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await page.getByRole('button', { name: 'Створити' }).click();
  await page.getByRole('button', { name: 'Додати ліміт' }).first().click();
  const limitDialog = page.getByRole('dialog');
  await limitDialog.getByLabel('Ліміт, UAH').fill('200');
  await limitDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(limitDialog).toBeHidden();

  await page.getByRole('link', { name: 'Аналітика' }).click();

  // Категорії: суми, частки й підсумок.
  const categories = page.getByTestId('analytics-categories');
  const food = categories.getByRole('row').filter({ hasText: 'Продукти' });
  await expect(food).toContainText('300,00');
  await expect(food).toContainText('75,0%');
  const transport = categories.getByRole('row').filter({ hasText: 'Транспорт' });
  await expect(transport).toContainText('100,00');
  await expect(transport).toContainText('25,0%');
  await expect(categories.getByRole('row').filter({ hasText: 'Разом' })).toContainText('400,00');
  // графік намальовано: по стовпчику на категорію
  await expect(categories.locator('.recharts-bar-rectangle')).toHaveCount(2);

  // Динаміка: шість місяців, в останньому — дохід, витрати, різниця й норма заощаджень.
  const trend = page.getByTestId('analytics-trend');
  await expect(trend.getByTestId('trend-row')).toHaveCount(6);
  const thisMonth = trend.getByTestId('trend-row').last();
  await expect(thisMonth).toContainText('900,00');
  await expect(thisMonth).toContainText('400,00');
  await expect(thisMonth).toContainText('+500,00');
  await expect(thisMonth).toContainText('55,6%');

  // Перевитрата передана не лише кольором: є іконка й текст.
  const overspent = page.getByTestId('overspent-row').filter({ hasText: 'Продукти' });
  await expect(overspent).toContainText('Перевищено на 100,00');
  await expect(overspent.locator('svg.lucide-triangle-alert')).toBeVisible();
  await expect(page.getByTestId('analytics-forecast')).toContainText('Прогноз на кінець місяця');

  // Чисті активи: 900 − 400.
  const netWorth = page.getByTestId('analytics-net-worth');
  await expect(netWorth.getByTestId('net-worth-row').last()).toContainText('500,00');

  await page.screenshot({ path: 'test-results/analytics-middle.png' });

  // Перемикач довжини динаміки.
  await page.getByRole('button', { name: '12 міс.' }).click();
  await expect(trend.getByTestId('trend-row')).toHaveCount(12);
  await expect(page.getByRole('button', { name: '12 міс.' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '6 міс.' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.screenshot({ path: 'test-results/analytics-top.png' });
  await page.getByTestId('analytics-net-worth').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/analytics-bottom.png' });

  // Попередній місяць: витрат не було, прогнозу немає.
  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(categories.getByRole('row').filter({ hasText: 'Разом' })).toHaveCount(0);
  await expect(page.getByTestId('analytics-forecast')).toHaveCount(0);
});
