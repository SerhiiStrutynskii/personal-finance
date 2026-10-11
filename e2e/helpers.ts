import { expect, type Page } from '@playwright/test';

export async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Імʼя').fill('Тест');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Пароль').fill('e2e-password-123');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();
}

export async function addAccount(page: Page, name: string) {
  await page.getByRole('link', { name: 'Рахунки' }).click();
  await page.getByRole('button', { name: 'Додати рахунок' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name).first()).toBeVisible();
}

export async function addExpenseCategory(page: Page, name: string) {
  await page.getByRole('link', { name: 'Категорії' }).click();
  await page.getByRole('button', { name: 'Додати категорію' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
}
