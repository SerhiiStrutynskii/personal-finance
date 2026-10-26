import { expect, test, type Page } from '@playwright/test';
import { openShopping, register } from './helpers.ts';

async function openProducts(page: Page) {
  await openShopping(page);
  await page.getByRole('link', { name: 'Продукти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();
}

async function addProduct(page: Page, name: string, price: string) {
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByLabel(/^Ціна за/).fill(price);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
}

async function createList(page: Page, name: string) {
  await openShopping(page);
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function addItem(page: Page, name: string, quantity: string) {
  const form = page.getByRole('form', { name: 'Додати продукт у список' });
  await form.getByLabel('Продукт', { exact: true }).fill(name);
  await form.getByLabel(/^Кількість/).fill(quantity);
  return form;
}

test('довідник продуктів: додати з ціною, змінити ціну, дублікат, видалити', async ({ page }) => {
  await register(page);
  await openProducts(page);
  await expect(page.getByText('Продуктів ще немає')).toBeVisible();

  // Новий продукт з одиницею й ціною за неї.
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Молоко');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'л', exact: true }).click();
  await dialog.getByLabel('Ціна за л, UAH').fill('42,5');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
  const milk = page.getByTestId('product').filter({ hasText: 'Молоко' });
  await expect(milk.getByTestId('product-price')).toHaveText(/^42,50\s\S+ \/ л$/);

  // Ціна змінюється; форма відкривається з поточними значеннями.
  await page.getByRole('button', { name: 'Змінити «Молоко»' }).click();
  await expect(dialog.getByLabel('Ціна за л, UAH')).toHaveValue('42,50');
  await dialog.getByLabel('Ціна за л, UAH').fill('45,90');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
  await expect(milk.getByTestId('product-price')).toHaveText(/^45,90\s\S+ \/ л$/);

  // Та сама назва іншим регістром — той самий продукт.
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  await dialog.getByLabel('Назва').fill('молоко');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog.getByText('Продукт з такою назвою вже існує')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Видалити продукт «Молоко»' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Продуктів ще немає')).toBeVisible();
});

test('список покупок: очікувані й фактичні ціни, підсумки, нова ціна в довіднику', async ({
  page,
}) => {
  await register(page);
  await openProducts(page);
  await addProduct(page, 'Хліб', '32');

  await createList(page, 'На тиждень');
  // Продукт з довідника — з його ціною.
  let form = await addItem(page, 'хліб', '2');
  await form.getByRole('button', { name: 'Додати' }).click();
  const bread = page.getByTestId('shopping-item').filter({ hasText: 'Хліб' });
  await expect(bread.getByTestId('item-expected')).toContainText(/64,00/);

  // Нового продукту немає в довіднику: одиниця й ціна вводяться тут же.
  form = await addItem(page, 'Сир', '0,3');
  await form.getByRole('combobox', { name: 'Одиниця' }).click();
  await page.getByRole('option', { name: 'кг', exact: true }).click();
  await form.getByLabel('Ціна за кг, UAH').fill('320');
  await form.getByRole('button', { name: 'Додати' }).click();
  const cheese = page.getByTestId('shopping-item').filter({ hasText: 'Сир' });
  await expect(cheese).toContainText('0,3 кг');
  await expect(cheese.getByTestId('item-expected')).toContainText(/96,00/);

  const totals = page.getByTestId('shopping-totals');
  await expect(totals).toContainText(/Очікувано за весь список\s*160,00/);

  // Позначка «куплено» підставляє очікувану ціну, яку можна виправити.
  await bread.getByRole('checkbox', { name: 'Куплено «Хліб»' }).check();
  const breadPrice = bread.getByLabel('Фактична ціна «Хліб» за шт');
  await expect(breadPrice).toHaveValue('32,00');
  await breadPrice.fill('35');
  await breadPrice.press('Enter');
  await expect(bread.getByTestId('item-actual')).toContainText(/70,00/);
  await expect(totals).toContainText(/Куплено \(1 з 2\) фактично\s*70,00/);
  await expect(totals).toContainText(/Залишилось купити на\s*96,00/);
  await expect(totals).toContainText(/Відхилення від очікуваних цін\s*\+6,00/);

  // Наступний список уже очікує нову ціну хліба.
  await createList(page, 'Наступний');
  form = await addItem(page, 'Хліб', '1');
  await form.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByTestId('shopping-item')).toContainText('35,00');

  // Продукт з історії покупок не видаляється, а архівується.
  await openProducts(page);
  await expect(
    page.getByTestId('product').filter({ hasText: 'Хліб' }).getByTestId('product-price'),
  ).toHaveText(/^35,00\s\S+ \/ шт$/);
  await page.getByRole('button', { name: 'Видалити продукт «Хліб»' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText(/Заархівуйте його/)).toBeVisible();
  await page.getByRole('button', { name: 'Заархівувати «Хліб»' }).click();
  await expect(page.getByTestId('product').filter({ hasText: 'Хліб' })).toBeHidden();
});

test('сторінка друку: усі рядки без меню, друк і PDF через діалог друку', async ({ page }) => {
  await register(page);
  await createList(page, 'Субота');
  for (const [name, quantity, price] of [
    ['Хліб', '2', '32'],
    ['Молоко', '1', '42,5'],
  ] as const) {
    const form = await addItem(page, name, quantity);
    await form.getByLabel(/^Ціна за/).fill(price);
    await form.getByRole('button', { name: 'Додати' }).click();
    await expect(page.getByTestId('shopping-item').filter({ hasText: name })).toBeVisible();
  }
  await page.getByRole('checkbox', { name: 'Куплено «Хліб»' }).check();
  await expect(page.getByTestId('shopping-totals')).toContainText('Куплено (1 з 2)');

  // Діалог друку браузера в тесті не відкривається: рахуємо виклики.
  await page.evaluate(() => {
    (window as unknown as { printCalls: number }).printCalls = 0;
    window.print = () => {
      (window as unknown as { printCalls: number }).printCalls += 1;
    };
  });
  await page.getByRole('link', { name: 'Друк і PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Субота' })).toBeVisible();
  await expect(page).toHaveTitle('Покупки — Субота');
  await expect(page.getByRole('navigation')).toHaveCount(0);

  const rows = page.getByTestId('print-item');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Молоко' })).toContainText(/42,50\s\S+ \/ шт/);
  await expect(page.getByTestId('print-totals')).toContainText(/Очікувано за весь список\s*106,50/);

  await page.getByRole('button', { name: 'Друкувати' }).click();
  await page.getByRole('button', { name: 'Завантажити PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(
    2,
  );

  // Куплене можна прибрати з аркуша.
  await page.getByLabel('Лише некуплене').check();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('print-totals')).toContainText(/Очікувано за некуплене\s*42,50/);

  // На папері лишається тільки список, без кнопок.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('print-toolbar')).toBeHidden();
  await expect(page.getByTestId('print-table')).toBeVisible();
});

test('куплене за списками видно в аналітиці й в історії цін продукту', async ({ page }) => {
  await register(page);
  // Дві покупки хліба: за 32 і дорожче, за 35.
  for (const [list, actual] of [
    ['Перший', null],
    ['Другий', '35'],
  ] as const) {
    await createList(page, list);
    const form = await addItem(page, 'Хліб', '2');
    if (list === 'Перший') await form.getByLabel(/^Ціна за/).fill('32');
    await form.getByRole('button', { name: 'Додати' }).click();
    const bread = page.getByTestId('shopping-item').filter({ hasText: 'Хліб' });
    await bread.getByRole('checkbox', { name: 'Куплено «Хліб»' }).check();
    await expect(bread.getByTestId('item-actual')).toContainText('64,00');
    if (actual) {
      const price = bread.getByLabel('Фактична ціна «Хліб» за шт');
      await price.fill(actual);
      await price.press('Enter');
      await expect(bread.getByTestId('item-actual')).toContainText('70,00');
    }
  }

  await page.getByRole('link', { name: 'Аналітика' }).click();
  const section = page.getByTestId('analytics-shopping');
  await expect(section).toContainText('Окремо від витрат');
  await expect(section.getByTestId('shopping-month')).toContainText(/134,00/);
  await expect(section.getByTestId('shopping-month')).toContainText(
    /Відхилення від очікуваних цін\s*\+6,00/,
  );

  // Таблиця за період: продукт, кількість, сума, частка, ціни.
  const period = section.getByTestId('shopping-period');
  await expect(period).toContainText('За 6 міс.');
  const row = period.getByTestId('shopping-period-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('4 шт');
  await expect(row).toContainText(/134,00/);
  await expect(row).toContainText('100,0%');
  await expect(row).toContainText(/32,00\s\S+ – 35,00/);

  // Графіки: по місяцях, кругова діаграма, обраний продукт помісячно.
  await expect(period.getByTestId('shopping-monthly-chart').locator('svg').first()).toBeVisible();
  await expect(period.getByTestId('shopping-pie-item')).toHaveCount(1);
  await expect(period.getByTestId('shopping-pie-item')).toContainText('Хліб');
  const productChart = period.getByTestId('shopping-product-chart');
  await expect(productChart.getByRole('combobox', { name: 'Продукт для графіка' })).toHaveText(
    'Хліб',
  );
  await expect(productChart.getByTestId('shopping-product-month')).toHaveCount(6);
  await expect(productChart.getByTestId('shopping-product-month').last()).toContainText(/134,00/);

  // 12 місяців — той самий перемикач, що й для решти аналітики.
  await page.getByRole('button', { name: '12 міс.' }).click();
  await expect(period).toContainText('За 12 міс.');
  await expect(productChart.getByTestId('shopping-product-month')).toHaveCount(12);

  await row.getByRole('button', { name: 'Хліб' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Історія цін «Хліб»' })).toBeVisible();
  const points = dialog.getByTestId('price-point');
  await expect(points).toHaveCount(2);
  await expect(points.first()).toContainText(/Другий.*35,00/);
});
