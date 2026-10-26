import { expect, test, type Page } from '@playwright/test';
import { addAccount, addExpenseCategory, register } from './helpers.ts';

const PAGES = [
  'Головна',
  'Витрати',
  'Прибутки',
  'Рахунки',
  'Категорії',
  'Бюджет',
  'Борги',
  'Цілі',
  'Меню',
  // Таб модуля «Меню» — видно на сторінці меню.
  'Покупки',
  'Аналітика',
];

/** Відкриває сторінку меню й чекає, поки завершаться всі її запити до API. */
async function openPage(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
  await expect
    .poll(async () => {
      // Запит стартує після рендеру сторінки, тож спершу даємо йому шанс з'явитися.
      await page.waitForTimeout(100);
      return pendingApi.get(page)?.size ?? 0;
    })
    .toBe(0);
}

const pendingApi = new WeakMap<Page, Set<unknown>>();

function trackApi(page: Page) {
  const pending = new Set<unknown>();
  pendingApi.set(page, pending);
  const isApi = (url: string) => new URL(url).pathname.startsWith('/api/');
  page.on('request', (request) => isApi(request.url()) && pending.add(request));
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => pending.delete(request));
}

test.beforeEach(({ page }) => trackApi(page));

test('повторний перехід між сторінками бере дані з кешу, без запитів до API', async ({ page }) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');
  for (const name of PAGES) await openPage(page, name);

  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/')) {
      requests.push(new URL(request.url()).pathname);
    }
  });
  for (const name of PAGES) await openPage(page, name);

  expect(requests).toEqual([]);
});

test('зміна на одній сторінці видна на іншій, уже відкритій раніше', async ({ page }) => {
  await register(page);
  await addAccount(page, 'Картка');
  await addExpenseCategory(page, 'Продукти');

  // Головна й витрати потрапляють у кеш.
  await openPage(page, 'Головна');
  await expect(page.getByTestId('dashboard-money')).toContainText('Чисті активи');
  await openPage(page, 'Витрати');

  // Баланс рахунку змінено на сторінці рахунків — головна показує новий капітал.
  await openPage(page, 'Рахунки');
  await page.getByRole('button', { name: 'Змінити баланс «Картка»' }).click();
  const balanceDialog = page.getByRole('dialog');
  await balanceDialog.getByLabel('Фактичний баланс, UAH').fill('1000');
  await balanceDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(balanceDialog).toBeHidden();
  await openPage(page, 'Головна');
  await expect(page.getByTestId('dashboard-money')).toContainText(/1\s000,00/);

  // Нова категорія одразу є у формі витрати, хоча категорії вже були в кеші.
  await addExpenseCategory(page, 'Кафе');
  await openPage(page, 'Витрати');
  await page.getByRole('button', { name: 'Додати' }).click();
  const expenseDialog = page.getByRole('dialog');
  await expect(expenseDialog.getByRole('heading', { name: 'Нова витрата' })).toBeVisible();
  // другий список у формі — категорія (перший — рахунок)
  await expenseDialog.getByRole('combobox').nth(1).click();
  await expect(page.getByRole('option', { name: 'Кафе' })).toBeVisible();
});
