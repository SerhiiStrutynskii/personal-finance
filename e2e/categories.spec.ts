import { expect, test } from '@playwright/test';
import { addAccount, register } from './helpers.ts';

test('підкатегорії: створення, видаток на підкатегорію, ліміт групи й розбивка в аналітиці', async ({
  page,
}) => {
  await register(page);
  await addAccount(page, 'Картка');

  // Група «Комунальні» з підкатегоріями «Вода» й «Газ».
  await page.getByRole('link', { name: 'Категорії' }).click();
  await page.getByRole('button', { name: 'Додати категорію' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Комунальні');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();

  for (const name of ['Вода', 'Газ']) {
    await page.getByRole('button', { name: 'Підкатегорія в «Комунальні»' }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Нова підкатегорія «Комунальні»' }),
    ).toBeVisible();
    await dialog.getByLabel('Назва').fill(name);
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
  }
  const group = page.getByTestId('category-group').filter({ hasText: 'Комунальні' });
  await expect(group).toContainText('Вода');
  await expect(group).toContainText('Газ');

  // Бюджет із лімітом на всю групу.
  await page.getByRole('link', { name: 'Бюджет' }).click();
  await page.getByRole('button', { name: 'Створити' }).click();
  await page.getByRole('button', { name: 'Додати ліміт' }).click();
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Комунальні', exact: true }).click();
  await dialog.getByLabel('Ліміт, UAH').fill('500');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();

  // Видатки на підкатегорії рахуються в ліміт групи.
  async function spend(amount: string, category: string) {
    await page.getByRole('button', { name: 'Видаток', exact: true }).click();
    await dialog.getByLabel('Сума, UAH').fill(amount);
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: category, exact: true }).click();
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
  }
  await spend('300', 'Комунальні › Вода');
  await spend('250', 'Комунальні › Газ');

  const row = page.getByTestId('expense-line').filter({ hasText: 'Комунальні' });
  await expect(row).toHaveAttribute('data-status', 'over');
  await expect(row).toContainText('Перевищено на 50,00');
  // Ліміт на підкатегорію групи з лімітом не пропонується.
  await page.getByRole('button', { name: 'Додати ліміт' }).click();
  await expect(dialog.getByText('Усі категорії витрат уже мають ліміт')).toBeVisible();
  await page.keyboard.press('Escape');

  // В аналітиці — рядок групи, що розгортається до підкатегорій.
  await page.getByRole('link', { name: 'Аналітика' }).click();
  const section = page.getByTestId('analytics-categories');
  await section.getByRole('button', { name: 'Комунальні' }).click();
  const subcategories = section.getByTestId('analytics-subcategory');
  await expect(subcategories).toHaveCount(2);
  await expect(subcategories.first()).toContainText('Вода');
  await expect(subcategories.first()).toContainText('300,00');
});
