import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { addAccount, addExpenseCategory, goTo, register } from './helpers.ts';

const BOM = '﻿';
const HEADER = 'Дата;Сума;Валюта;Категорія;Рахунок;Опис';

/** Додає видаток у місяць, який зараз відкрито на сторінці «Витрати»; повертає дату з форми. */
async function addExpense(page: Page, amount: string, description: string): Promise<string> {
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Сума, UAH').fill(amount);
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Продукти' }).click();
  await dialog.getByLabel('Опис').fill(description);
  const date = await dialog.getByLabel('Дата').inputValue();
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
  // На телефоні — список, на десктопі — таблиця.
  await expect(page.getByText(description, { exact: true }).filter({ visible: true })).toHaveCount(
    1,
  );
  return date;
}

/** Натискає «Експорт CSV» і повертає назву та вміст завантаженого файлу. */
async function exportCsv(page: Page): Promise<{ filename: string; text: string }> {
  const button = page.getByRole('button', { name: 'Експорт CSV' });
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return { filename: download.suggestedFilename(), text: await contentOf(download) };
}

async function contentOf(download: Download): Promise<string> {
  const path = await download.path();
  return readFile(path, 'utf8');
}

async function setup(page: Page) {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');
  await goTo(page, 'Витрати');
}

test('AC18–AC20: експорт витрат поточного й попереднього місяця', async ({ page }) => {
  await setup(page);
  const exportButton = page.getByRole('button', { name: 'Експорт CSV' });

  // Порожній місяць: кнопка видима, але неактивна.
  await expect(page.getByText('За цей місяць витрат немає')).toBeVisible();
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeDisabled();

  const today = await addExpense(page, '1284,5', 'Супермаркет');
  const currentMonth = today.slice(0, 7);

  const current = await exportCsv(page);
  expect(current.filename).toBe(`expenses-${currentMonth}.csv`);
  expect(current.text.startsWith(`${BOM}${HEADER}\r\n`)).toBe(true);
  expect(current.text).toContain(`${today};1284,50;UAH;Продукти;Картка;Супермаркет\r\n`);

  // Попередній місяць: спершу порожній — кнопка неактивна; після видатку — файл саме цього місяця.
  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(page.getByText('За цей місяць витрат немає')).toBeVisible();
  await expect(exportButton).toBeDisabled();

  const pastDate = await addExpense(page, '40', 'Ринок');
  const pastMonth = pastDate.slice(0, 7);
  expect(pastMonth < currentMonth).toBe(true);

  const past = await exportCsv(page);
  expect(past.filename).toBe(`expenses-${pastMonth}.csv`);
  expect(past.text).toBe(`${BOM}${HEADER}\r\n${pastDate};40,00;UAH;Продукти;Картка;Ринок\r\n`);
  expect(past.text).not.toContain('Супермаркет');
});

test('AC22: на сторінці «Прибутки» кнопки експорту немає', async ({ page }) => {
  await register(page);
  await addAccount(page, 'Картка');
  await goTo(page, 'Прибутки');
  await expect(page.getByRole('heading', { name: 'Прибутки', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Попередній місяць' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Експорт/ })).toHaveCount(0);
});

test.describe('телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('AC21: кнопка експорту видима, файл завантажується, без горизонтальної прокрутки', async ({
    page,
  }) => {
    await setup(page);
    const exportButton = page.getByRole('button', { name: 'Експорт CSV' });
    await expect(exportButton).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Додати', exact: true })).toBeInViewport({
      ratio: 1,
    });

    const today = await addExpense(page, '99', 'Кава');
    await expect(exportButton).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    const file = await exportCsv(page);
    expect(file.filename).toBe(`expenses-${today.slice(0, 7)}.csv`);
    expect(file.text).toContain(`${today};99,00;UAH;Продукти;Картка;Кава\r\n`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
