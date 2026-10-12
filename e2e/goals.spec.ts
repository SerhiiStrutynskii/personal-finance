import { expect, test } from '@playwright/test';
import { addAccount, register } from './helpers.ts';

test('ціль накопичення: поповнення з іншого рахунку збільшує прогрес', async ({ page }) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addAccount(page, 'Скарбничка');

  // Ціль 1 000 грн на рахунку «Скарбничка».
  await page.getByRole('link', { name: 'Цілі' }).click();
  await expect(page.getByText('Цілей ще немає')).toBeVisible();
  await page.getByRole('button', { name: 'Ціль', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Подушка');
  // другий список у формі — рахунок (перший — вид цілі)
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: /Скарбничка/ }).click();
  await dialog.getByLabel('Сума цілі, UAH').fill('1000');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByTestId('goal-card').filter({ hasText: 'Подушка' });
  await expect(card).toHaveAttribute('data-state', 'no_deadline');
  await expect(card.getByTestId('goal-progress')).toContainText('Зібрано 0,00');
  await expect(card.getByTestId('goal-progress')).toContainText('0,0%');

  // Поповнення 250 грн з картки.
  await card.getByRole('button', { name: 'Поповнити' }).click();
  const contribution = page.getByRole('dialog');
  await contribution.getByLabel('Сума, UAH').fill('250');
  // на картці грошей немає — попередження, але не блокування
  await expect(contribution.getByText('менше коштів, ніж сума поповнення')).toBeVisible();
  await contribution.getByRole('button', { name: 'Поповнити' }).click();
  await expect(contribution).toBeHidden();

  await expect(card.getByTestId('goal-progress')).toContainText('Зібрано 250,00');
  await expect(card.getByTestId('goal-progress')).toContainText('25,0%');
  await expect(card).toContainText('лишилося 750,00');

  // Поповнення — це переказ: баланси рахунків змінилися.
  await page.getByRole('link', { name: 'Рахунки' }).click();
  const balances = page.getByTestId('account-balance');
  await expect(balances.first()).toContainText('-250,00');
  await expect(balances.nth(1)).toContainText('250,00');

  // Решта суми — ціль досягнуто; стан передано текстом та іконкою.
  await page.getByRole('link', { name: 'Цілі' }).click();
  await card.getByRole('button', { name: 'Поповнити' }).click();
  await contribution.getByLabel('Сума, UAH').fill('750');
  await contribution.getByRole('button', { name: 'Поповнити' }).click();
  await expect(contribution).toBeHidden();
  await expect(card).toHaveAttribute('data-state', 'achieved');
  await expect(card).toContainText('Ціль досягнуто');
  await expect(card.locator('svg.lucide-check')).toBeVisible();
  await page.screenshot({ path: 'test-results/goals-savings.png' });
});

test('ціль виходу з боргів: додатковий платіж робить місяць виходу з боргів ранішим', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Картка');

  // Позика 1 200 грн без відсотків із платежем 100 грн — 12 місяців.
  await page.getByRole('link', { name: 'Борги' }).click();
  await page.getByRole('button', { name: 'Борг', exact: true }).click();
  const debtDialog = page.getByRole('dialog');
  await debtDialog.getByLabel('Назва').fill('Позика');
  await debtDialog.getByLabel('Сума боргу, UAH').fill('1200');
  await debtDialog.getByLabel('Ставка, %').fill('0');
  await debtDialog.getByLabel('Щомісячний платіж, UAH').fill('100');
  await debtDialog.getByLabel('Виданий до').fill('2035-01-01');
  await debtDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(debtDialog).toBeHidden();

  await page.getByRole('link', { name: 'Цілі' }).click();
  await page.getByRole('button', { name: 'Ціль', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Вихід із боргів' }).click();
  await dialog.getByLabel('Назва').fill('Без боргів');
  await dialog.getByRole('checkbox', { name: /Позика/ }).check();
  await dialog.getByLabel('Погасити до').fill('2035-01-01');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByTestId('goal-card').filter({ hasText: 'Без боргів' });
  await expect(card).toHaveAttribute('data-state', 'on_track');
  await expect(card.getByTestId('goal-progress')).toContainText('Погашено 0,00');
  await card.getByRole('link', { name: 'План погашення' }).click();

  // Мінімальні платежі: 12 місяців.
  const summary = page.getByTestId('payoff-summary');
  await expect(summary).toContainText('за 12 місяців');
  await expect(page.getByTestId('payoff-order')).toContainText('1. Позика');
  const baseline = await summary.locator('.text-xl').first().innerText();
  await expect(page.getByRole('button', { name: 'Зберегти як план цілі' })).toBeDisabled();

  // Додаткові 200 грн на місяць: 300 на місяць — 4 місяці.
  await page.getByLabel('Додатковий платіж на місяць, UAH').fill('200');
  await expect(summary).toContainText('за 4 місяці');
  await expect(summary).toContainText('на 8 місяців раніше');
  const faster = await summary.locator('.text-xl').first().innerText();
  expect(faster).not.toBe(baseline);
  await expect(page.locator('.recharts-line-curve')).toBeVisible();
  await page.screenshot({ path: 'test-results/goals-payoff.png' });

  // Збережений план стає планом цілі.
  await page.getByRole('button', { name: 'Зберегти як план цілі' }).click();
  await expect(page.getByText('Це збережений план цілі.')).toBeVisible();
  await page.getByRole('link', { name: 'Усі цілі' }).click();
  await expect(card).toContainText(faster.toLowerCase());
});
