import { expect, test, type Page } from '@playwright/test';
import { goTo, openShopping, register } from './helpers.ts';

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Розділи меню' });
const tab = (page: Page, name: string) => tabs(page).getByRole('link', { name, exact: true });

async function expectActiveTab(page: Page, active: string, inactive: string) {
  await expect(tab(page, active)).toHaveAttribute('aria-current', 'page');
  await expect(tab(page, inactive)).not.toHaveAttribute('aria-current', 'page');
  // Пункт навігації «Меню» активний на всіх сторінках модуля.
  await expect(page.getByRole('link', { name: 'Меню', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
}

async function createList(page: Page, name: string): Promise<string> {
  await openShopping(page);
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Створити' }).click();
  await expect(page).toHaveURL(/\/menu\/lists\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return new URL(page.url()).pathname.split('/').at(-1)!;
}

test.describe('таби меню, десктоп', () => {
  test('немає пункту «Покупки»; «Меню» з табами; активний таб за адресою', async ({ page }) => {
    await register(page);
    await expect(page.getByRole('link', { name: 'Меню', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Покупки', exact: true })).toHaveCount(0);

    await goTo(page, 'Меню');
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole('heading', { name: 'Меню', level: 1 })).toBeVisible();
    await expectActiveTab(page, 'Планування раціону', 'Покупки');

    await tab(page, 'Покупки').click();
    await expect(page).toHaveURL(/\/menu\/lists$/);
    await expectActiveTab(page, 'Покупки', 'Планування раціону');
    await expect(page.getByText('Списків ще немає')).toBeVisible();

    await page.getByRole('link', { name: 'Продукти', exact: true }).click();
    await expect(page).toHaveURL(/\/menu\/products$/);
    await expectActiveTab(page, 'Покупки', 'Планування раціону');

    await page.goto('/menu/lists');
    await page.getByRole('link', { name: 'Покупки за меню' }).click();
    await expect(page).toHaveURL(/\/menu\/shopping\?period=week$/);
    await expectActiveTab(page, 'Покупки', 'Планування раціону');

    await tab(page, 'Планування раціону').click();
    await expect(page).toHaveURL(/\/menu$/);
    await page.getByRole('link', { name: 'Страви й прийоми їжі' }).click();
    await expect(page).toHaveURL(/\/menu\/dictionaries$/);
    await expectActiveTab(page, 'Планування раціону', 'Покупки');

    // Список: створення, прогрес і перехід у список — у табі «Покупки».
    await createList(page, 'Субота');
    await expectActiveTab(page, 'Покупки', 'Планування раціону');
    await page.getByRole('link', { name: 'Усі списки' }).click();
    await expect(page).toHaveURL(/\/menu\/lists$/);
    await expect(page.getByTestId('shopping-list')).toContainText('Субота');
    await expect(page.getByTestId('shopping-list')).toContainText('Куплено 0 з 0');
  });

  test('старі адреси /shopping… ведуть на нові із заміною історії', async ({ page }) => {
    await register(page);
    const id = await createList(page, 'Неділя');

    await page.goto('/');
    await page.goto('/shopping');
    await expect(page).toHaveURL(/\/menu\/lists$/);
    await expect(page.getByTestId('shopping-list')).toContainText('Неділя');
    // Редирект замінює запис: «Назад» веде на попередню сторінку, а не на /shopping.
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/shopping/products');
    await expect(page).toHaveURL(/\/menu\/products$/);
    await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();

    await page.goto(`/shopping/${id}`);
    await expect(page).toHaveURL(new RegExp(`/menu/lists/${id}$`));
    await expect(page.getByRole('heading', { name: 'Неділя' })).toBeVisible();

    await page.goto(`/shopping/${id}/print`);
    await expect(page).toHaveURL(new RegExp(`/menu/lists/${id}/print$`));
    await expect(page).toHaveTitle('Покупки — Неділя');
    // Сторінка друку — без меню застосунку й табів.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Відкрити меню' })).toHaveCount(0);
    await page.getByRole('link', { name: 'До списку' }).click();
    await expect(page).toHaveURL(new RegExp(`/menu/lists/${id}$`));

    // Жодне посилання в застосунку не веде на /shopping…
    for (const path of ['/menu/lists', `/menu/lists/${id}`, '/menu/products', '/analytics']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(await page.locator('a[href^="/shopping"]').count()).toBe(0);
    }
  });
});

test.describe('таби меню, телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('таби в один рядок без прокрутки вбік; таб «Покупки» показує списки', async ({ page }) => {
    await register(page);
    await createList(page, 'Субота');
    await goTo(page, 'Меню');
    await expect(page).toHaveURL(/\/menu$/);
    const noHorizontalScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    const planning = await tab(page, 'Планування раціону').boundingBox();
    const shopping = await tab(page, 'Покупки').boundingBox();
    expect(Math.abs(planning!.y - shopping!.y)).toBeLessThan(1);
    expect(shopping!.x + shopping!.width).toBeLessThanOrEqual(390);
    expect(planning!.height).toBeGreaterThanOrEqual(40);
    expect(await noHorizontalScroll()).toBe(true);

    await tab(page, 'Покупки').click();
    await expect(page).toHaveURL(/\/menu\/lists$/);
    await expect(page.getByTestId('shopping-list')).toContainText('Субота');
    await expect(page.getByRole('banner')).toContainText('Меню');
    expect(await noHorizontalScroll()).toBe(true);
  });
});
