import { expect, type Page } from '@playwright/test';

export async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Імʼя').fill('Тест');
  await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel('Пароль').fill('e2e-password-123');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();
}

/** Перехід через меню: на телефоні пункти меню сховані у висувному меню. */
export async function goTo(page: Page, section: string) {
  // Ширина, як у MobileNav: вужче за md (768px) меню висувне.
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    await page.getByRole('dialog').getByRole('link', { name: section, exact: true }).click();
    return;
  }
  await page.getByRole('link', { name: section, exact: true }).click();
}

export async function addAccount(page: Page, name: string) {
  await goTo(page, 'Рахунки');
  await page.getByRole('button', { name: 'Додати рахунок' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name).first()).toBeVisible();
}

export async function addExpenseCategory(page: Page, name: string) {
  await goTo(page, 'Категорії');
  await page.getByRole('button', { name: 'Додати категорію' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
}
