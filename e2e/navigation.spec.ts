import { expect, test } from '@playwright/test';
import { addAccount, addExpenseCategory, goTo, register } from './helpers.ts';

test.describe('телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('висувне меню відкривається, веде на сторінку й закривається', async ({ page }) => {
    await register(page);
    const header = page.getByRole('banner');
    await expect(header).toContainText('Головна');
    // Сайдбара немає — пункти меню приховані, поки меню закрите.
    await expect(page.getByRole('link', { name: 'Рахунки' })).toBeHidden();
    await expect(
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).resolves.toBe(true);

    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    const menu = page.getByRole('dialog', { name: 'Prospera' });
    await expect(menu.getByText('Вийти')).toBeVisible();
    await menu.getByRole('link', { name: 'Рахунки' }).click();
    await expect(menu).toBeHidden();
    await expect(header).toContainText('Рахунки');
    await expect(page.getByRole('button', { name: 'Додати рахунок' })).toBeVisible();

    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('на головній «Потребує уваги» стоїть над грошима', async ({ page }) => {
    await register(page);
    await addAccount(page, 'Картка');

    await goTo(page, 'Головна');
    const attention = await page.getByTestId('dashboard-attention').boundingBox();
    const money = await page.getByTestId('dashboard-money').boundingBox();
    expect(attention!.y).toBeLessThan(money!.y);
    // Кнопки дій — під заголовком, а не стовпчиком праворуч.
    const add = await page.getByRole('button', { name: 'Видаток', exact: true }).boundingBox();
    const transfer = await page.getByRole('button', { name: 'Новий переказ' }).boundingBox();
    expect(Math.abs(add!.y - transfer!.y)).toBeLessThan(2);
  });

  test('витрати списком: сума й дії видно без прокручування вбік', async ({ page }) => {
    await register(page);
    await addAccount(page, 'Картка');
    await addExpenseCategory(page, 'Продукти');

    await goTo(page, 'Витрати');
    await page.getByRole('button', { name: 'Додати' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Сума, UAH').fill('1234,5');
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Продукти' }).click();
    await dialog.getByLabel('Опис').fill('Супермаркет');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();

    const item = page.getByTestId('transaction-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Супермаркет');
    await expect(item).toContainText('Продукти · Картка');
    await expect(item.getByText(/1\s234,50/)).toBeInViewport({ ratio: 1 });
    const actions = item.getByRole('button', { name: 'Дії із записом' });
    await expect(actions).toBeInViewport({ ratio: 1 });

    await actions.click();
    await page.getByRole('menuitem', { name: 'Змінити' }).click();
    await dialog.getByLabel('Опис').fill('Ринок');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await expect(item).toContainText('Ринок');
  });

  test('прибутки й рахунки: дії в рядку поруч із сумою', async ({ page }) => {
    await register(page);
    await addAccount(page, 'Картка');
    const balance = page.getByTestId('account-balance');
    await expect(balance).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Видалити рахунок «Картка»' })).toBeInViewport({
      ratio: 1,
    });

    await goTo(page, 'Прибутки');
    const month = await page.getByTestId('current-month').boundingBox();
    const sources = await page
      .getByRole('link', { name: 'Джерела прибутку', exact: true })
      .boundingBox();
    expect(
      Math.abs(month!.y + month!.height / 2 - (sources!.y + sources!.height / 2)),
    ).toBeLessThan(4);
  });
});

test.describe('планшет', () => {
  test.use({ viewport: { width: 900, height: 1000 } });

  test('сайдбар згорнутий до іконок і запамʼятовує розгортання', async ({ page }) => {
    await register(page);
    await expect(page.getByRole('button', { name: 'Відкрити меню' })).toBeHidden();
    await page.getByRole('button', { name: 'Розгорнути меню' }).click();
    await expect(page.getByRole('button', { name: 'Згорнути меню' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Згорнути меню' })).toBeVisible();
  });
});
