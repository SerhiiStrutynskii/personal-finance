import { expect, test, type Page } from '@playwright/test';
import { addAccount, addExpenseCategory, register } from './helpers.ts';

/** Відкриває вікно нового боргу й вибирає тип. */
async function openDebtDialog(page: Page, type: string) {
  await page.getByRole('link', { name: 'Борги' }).click();
  await page.getByRole('button', { name: 'Борг', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Новий борг' })).toBeVisible();
  // перший список у формі — тип боргу
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: type }).click();
  return dialog;
}

test('кредитка: видаток з картки збільшує борг і витрати бюджету, погашення бюджет не змінює', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Дебетова');
  await addExpenseCategory(page, 'Продукти');

  // Кредитка з лімітом 50 000 грн.
  const dialog = await openDebtDialog(page, 'Кредитна картка');
  await dialog.getByLabel('Назва').fill('Кредитка');
  await dialog.getByLabel('Кредитний ліміт, UAH').fill('50000');
  await dialog.getByLabel('Сума боргу, UAH').fill('0');
  await dialog.getByLabel('Ставка, %').fill('36');
  await dialog.getByLabel('Мінімальний платіж, UAH').fill('100');
  await expect(dialog.getByTestId('debt-projection')).toContainText('Борг погашено');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByTestId('debt-row').filter({ hasText: 'Кредитка' });
  await expect(row).toHaveAttribute('data-status', 'none');

  // Бюджет поточного місяця і видаток 150 грн з кредитки.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await page.getByRole('button', { name: 'Створити' }).click();
  await page.getByRole('button', { name: 'Видаток', exact: true }).click();
  const expenseDialog = page.getByRole('dialog');
  await expenseDialog.getByLabel('Сума, UAH').fill('150');
  // перший список — рахунок: кредитка показується з доступним лімітом
  await expenseDialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /Кредитка \(кредитка, доступно/ }).click();
  await expenseDialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Продукти' }).click();
  await expenseDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(expenseDialog).toBeHidden();

  const summary = page.locator('[data-slot=card]').first();
  await expect(summary).toContainText('Витрати150,00');
  await expect(page.getByText('Продукти').first()).toBeVisible();

  // Борг і використання ліміту зросли.
  await page.getByRole('link', { name: 'Борги' }).click();
  await expect(row).toContainText('Використано 150,00');
  await expect(row).toHaveAttribute('data-status', /due_soon|pending/);
  await row.getByRole('link', { name: 'Кредитка' }).click();
  await expect(page.getByTestId('debt-balance')).toContainText('150,00');
  await expect(page.getByTestId('card-limit')).toContainText('Використано 150,00');
  await expect(page.getByTestId('debt-history')).toContainText('Покупка');

  // Погашення всього боргу з дебетового рахунку.
  await page.getByRole('button', { name: 'Погасити' }).click();
  const payDialog = page.getByRole('dialog');
  await payDialog.getByRole('button', { name: 'Весь борг' }).click();
  await expect(payDialog.getByLabel('Сума, UAH')).toHaveValue('150,00');
  // на дебетовому рахунку грошей немає — попередження, але не блокування
  await expect(payDialog.getByText('менше коштів, ніж сума платежу')).toBeVisible();
  await payDialog.getByRole('button', { name: 'Погасити' }).click();
  await expect(payDialog).toBeHidden();

  await expect(page.getByTestId('debt-balance')).toContainText('0,00');
  await expect(page.getByTestId('debt-month-status')).toHaveAttribute('data-status', 'paid');
  await expect(page.getByTestId('debt-month-status')).toContainText('Сплачено');
  await expect(page.getByTestId('debt-history')).toContainText('Погашення з рахунку «Дебетова»');
  await page.screenshot({ path: 'test-results/debt-card.png', fullPage: true });

  // Бюджет не змінився: погашення — переказ, а не витрата.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await expect(summary).toContainText('Витрати150,00');
});

test('позика банку: місячний платіж дає статус «сплачено», зменшує рахунок і йде в «Погашення боргів»', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Дебетова');

  const dialog = await openDebtDialog(page, 'Позика банку');
  await dialog.getByLabel('Назва').fill('Позика на ремонт');
  await dialog.getByLabel('Сума боргу, UAH').fill('900');
  await dialog.getByLabel('Ставка, %').fill('0');
  await dialog.getByLabel('Щомісячний платіж, UAH').fill('100');
  await dialog.getByLabel('Виданий до').fill('2035-01-01');
  // прогноз рахується одразу у формі
  await expect(dialog.getByTestId('debt-projection')).toContainText('Погашення за 9 місяців');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();

  // Новий бюджет одразу має ліміт «Погашення боргів» на суму платежу.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await page.getByRole('button', { name: 'Створити' }).click();
  const line = page.getByTestId('expense-line').filter({ hasText: 'Погашення боргів' });
  await expect(line).toContainText('Залишок 100,00');

  await page.getByRole('link', { name: 'Борги' }).click();
  await expect(page.getByTestId('debts-summary')).toContainText('900,00');
  await page.getByRole('link', { name: 'Позика на ремонт' }).click();

  // Сума за замовчуванням — місячний платіж.
  await page.getByRole('button', { name: 'Сплатити' }).click();
  const payDialog = page.getByRole('dialog');
  await expect(payDialog.getByLabel('Сума, UAH')).toHaveValue('100,00');
  await expect(payDialog.getByTestId('payment-preview')).toContainText(
    'Залишок після платежу: 800,00',
  );
  await payDialog.getByRole('button', { name: 'Сплатити' }).click();
  await expect(payDialog).toBeHidden();

  await expect(page.getByTestId('debt-balance')).toContainText('800,00');
  await expect(page.getByTestId('debt-month-status')).toHaveAttribute('data-status', 'paid');
  await expect(page.getByTestId('debt-history')).toContainText('Платіж з рахунку «Дебетова»');
  await page.screenshot({ path: 'test-results/debt-loan.png', fullPage: true });

  // Баланс рахунку зменшився.
  await page.getByRole('link', { name: 'Рахунки' }).click();
  await expect(page.getByTestId('account-balance').first()).toContainText('-100,00');

  // У бюджеті зросла категорія «Погашення боргів».
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await expect(line).toHaveAttribute('data-status', 'neutral');
  await expect(line).toContainText('Залишок 0,00');
  await expect(page.locator('[data-slot=card]').first()).toContainText('Витрати100,00');

  // Умови змінюються з меню рядка у списку боргів.
  await page.getByRole('link', { name: 'Борги' }).click();
  const loanRow = page.getByTestId('debt-row').filter({ hasText: 'Позика на ремонт' });
  await loanRow.getByRole('button', { name: 'Дії з боргом «Позика на ремонт»' }).click();
  await page.getByRole('menuitem', { name: 'Змінити умови' }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog.getByRole('heading', { name: 'Умови боргу' })).toBeVisible();
  await editDialog.getByLabel('Щомісячний платіж, UAH').fill('200');
  await expect(editDialog.getByTestId('debt-projection')).toContainText('Погашення за 4 місяці');
  await editDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(editDialog).toBeHidden();
  await expect(loanRow).toContainText('Платіж 200,00');

  // Видалення боргу з рухами прибирає платіж: баланс рахунку й бюджет повертаються.
  await loanRow.getByRole('button', { name: 'Дії з боргом «Позика на ремонт»' }).click();
  await page.getByRole('menuitem', { name: 'Видалити' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Боргів ще немає')).toBeVisible();

  await page.getByRole('link', { name: 'Рахунки' }).click();
  await expect(page.getByTestId('account-balance').first()).toContainText('0,00');
  await expect(page.getByTestId('account-balance').first()).not.toContainText('-100,00');
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await expect(line).toContainText('Залишок 100,00');
});
