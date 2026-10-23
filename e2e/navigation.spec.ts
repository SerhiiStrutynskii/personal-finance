import { expect, test } from '@playwright/test';
import { register } from './helpers.ts';

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
