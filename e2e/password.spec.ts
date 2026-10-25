import { expect, test, type Page } from '@playwright/test';

const OLD_PASSWORD = 'e2e-password-123';
const NEW_PASSWORD = 'e2e-new-password-456';

async function registerAs(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Імʼя').fill('Тест');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(OLD_PASSWORD);
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();
}

async function loginAs(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Увійти' }).click();
}

const uniqueEmail = () => `e2e-pw-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function fillChangePassword(page: Page, current: string, next: string, repeat = next) {
  const dialog = page.getByRole('dialog', { name: 'Зміна пароля' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Поточний пароль/).fill(current);
  await // Помилка під полем входить у його підпис, тому — за початком назви.
  await dialog.getByLabel(/^Новий пароль/).fill(next);
  await dialog.getByLabel(/^Повторіть новий пароль/).fill(repeat);
  await dialog.getByRole('button', { name: 'Змінити пароль' }).click();
  return dialog;
}

test.describe('зміна пароля', () => {
  test('AC15: зміна з меню, сесія лишається; далі входить лише новий пароль', async ({ page }) => {
    const email = uniqueEmail();
    await registerAs(page, email);
    await page.getByRole('link', { name: 'Рахунки', exact: true }).click();
    await expect(page).toHaveURL(/\/accounts$/);

    await page.getByRole('button', { name: 'Змінити пароль' }).click();
    const dialog = page.getByRole('dialog', { name: 'Зміна пароля' });
    await expect(dialog.locator('input[type="password"]')).toHaveCount(3);
    await fillChangePassword(page, OLD_PASSWORD, NEW_PASSWORD);

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText(
      'Пароль змінено. Інші пристрої вийдуть із системи протягом 15 хвилин',
    );
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByRole('button', { name: 'Додати рахунок' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Додати рахунок' })).toBeVisible();

    await page.getByRole('button', { name: 'Вийти' }).click();
    await expect(page.getByRole('button', { name: 'Увійти' })).toBeVisible();
    await loginAs(page, email, OLD_PASSWORD);
    await expect(page.getByText('Невірний email або пароль')).toBeVisible();
    await loginAs(page, email, NEW_PASSWORD);
    await expect(page.getByRole('button', { name: 'Вийти' })).toBeVisible();
  });

  test('AC16: невірний поточний пароль — помилка під полем, сесія не завершується', async ({
    page,
  }) => {
    await registerAs(page, uniqueEmail());
    await page.getByRole('button', { name: 'Змінити пароль' }).click();

    // Помилки форми — без запиту до сервера.
    let requests = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/password')) requests += 1;
    });
    const dialog = await fillChangePassword(page, OLD_PASSWORD, 'short');
    await expect(dialog.getByText('Пароль має містити від 10 до 128 символів')).toBeVisible();
    await fillChangePassword(page, OLD_PASSWORD, NEW_PASSWORD, `${NEW_PASSWORD}-x`);
    await expect(dialog.getByText('Паролі не збігаються')).toBeVisible();
    expect(requests).toBe(0);

    await fillChangePassword(page, 'wrong-password-1', NEW_PASSWORD);
    await expect(dialog.getByText('Поточний пароль невірний')).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(requests).toBe(1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Вийти' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Вийти' })).toBeVisible();

    // Форма відкривається порожньою: паролі не лишаються після закриття.
    await page.getByRole('button', { name: 'Змінити пароль' }).click();
    await expect(dialog.getByLabel('Поточний пароль')).toHaveValue('');
  });

  test('AC17: інший пристрій після зміни пароля опиняється на сторінці входу', async ({
    browser,
  }) => {
    const email = uniqueEmail();
    const device1 = await browser.newContext();
    const device2 = await browser.newContext();
    const page1 = await device1.newPage();
    const page2 = await device2.newPage();

    await registerAs(page1, email);
    await page2.goto('/login');
    await loginAs(page2, email, OLD_PASSWORD);
    await expect(page2.getByRole('button', { name: 'Вийти' })).toBeVisible();

    await page1.getByRole('button', { name: 'Змінити пароль' }).click();
    const dialog = await fillChangePassword(page1, OLD_PASSWORD, NEW_PASSWORD);
    await expect(dialog).toBeHidden();

    // Access-токен живе лише в пам'яті вкладки: перезавантаження змушує оновити токен.
    await page2.reload();
    await expect(page2.getByRole('button', { name: 'Увійти' })).toBeVisible();
    await page1.reload();
    await expect(page1.getByRole('button', { name: 'Вийти' })).toBeVisible();

    await device1.close();
    await device2.close();
  });
});

test.describe('зміна пароля на телефоні', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('AC15, AC18: пункт у мобільному меню, діалог без горизонтального скролу', async ({
    page,
  }) => {
    await registerAs(page, uniqueEmail());
    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    const menu = page.getByRole('dialog', { name: 'Prospera' });
    await menu.getByRole('button', { name: 'Змінити пароль' }).click();

    const dialog = page.getByRole('dialog', { name: 'Зміна пароля' });
    await expect(dialog).toBeVisible();
    for (const label of ['Поточний пароль', 'Новий пароль', 'Повторіть новий пароль']) {
      const field = dialog.getByLabel(label, { exact: true });
      await expect(field).toBeInViewport({ ratio: 1 });
      const box = await field.boundingBox();
      expect(box!.width).toBeGreaterThan(300);
    }
    await expect(dialog.getByRole('button', { name: 'Змінити пароль' })).toBeInViewport({
      ratio: 1,
    });
    await expect(dialog.getByRole('button', { name: 'Скасувати' })).toBeInViewport({ ratio: 1 });
    await expect(
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).resolves.toBe(true);
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390);

    await fillChangePassword(page, OLD_PASSWORD, NEW_PASSWORD);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Пароль змінено');
  });
});
