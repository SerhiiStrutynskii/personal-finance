import { expect, test, type Page } from '@playwright/test';
import { goTo, openShopping, register } from './helpers.ts';

async function addProduct(page: Page, name: string, unit: string, price: string) {
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: unit, exact: true }).click();
  if (price) await dialog.getByLabel(/^Ціна за/).fill(price);
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();
}

/** Гречка (кг, 40 грн), олія (л, 90 грн) і сіль без ціни. */
async function addPantry(page: Page) {
  await page.goto('/menu/products');
  await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();
  await addProduct(page, 'Гречка', 'кг', '40');
  await addProduct(page, 'Олія', 'л', '90');
  await addProduct(page, 'Сіль', 'кг', '');
}

async function chooseProduct(page: Page, line: number, name: string) {
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: `Продукт ${line}` })
    .click();
  await page.getByRole('option', { name }).click();
}

const mealTypes = (page: Page) => page.getByTestId('meal-type');

/** Довідники меню: через пункт «Меню» й посилання в шапці календаря. */
async function openDictionaries(page: Page) {
  await goTo(page, 'Меню');
  await expect(page).toHaveURL(/\/menu$/);
  await page.getByRole('link', { name: 'Страви й прийоми їжі' }).click();
  await expect(page).toHaveURL(/\/menu\/dictionaries$/);
  await expect(page.getByRole('heading', { name: 'Довідники меню', level: 2 })).toBeVisible();
}

test.describe('десктоп', () => {
  test('прийоми їжі: типові, додати, перейменувати, переставити, видалити', async ({ page }) => {
    await register(page);
    await openDictionaries(page);
    // Пункт «Меню» лишається активним і на довідниках.
    await expect(page.getByRole('link', { name: 'Меню', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { name: 'Прийоми їжі' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Страви' })).toBeVisible();
    await expect(page.getByText('Страв ще немає')).toBeVisible();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря']);
    await expect(page.getByRole('button', { name: 'Вгору «Сніданок»' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Вниз «Вечеря»' })).toBeDisabled();

    await page.getByRole('button', { name: 'Додати прийом їжі' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Назва').fill('обід');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog.getByText('Прийом їжі з такою назвою вже існує')).toBeVisible();
    await dialog.getByLabel('Назва').fill('Перекус');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря', 'Перекус']);

    await page.getByRole('button', { name: 'Перейменувати «Перекус»' }).click();
    await expect(dialog.getByLabel('Назва')).toHaveValue('Перекус');
    await dialog.getByLabel('Назва').fill('Полуденок');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Вгору «Полуденок»' }).click();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Полуденок', 'Вечеря']);
    await expect(page.getByRole('button', { name: 'Вниз «Вечеря»' })).toBeDisabled();

    await page.reload();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Полуденок', 'Вечеря']);

    await page.getByRole('button', { name: 'Видалити прийом їжі «Полуденок»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря']);
    await page.reload();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря']);
  });

  test('страви: склад, ціна наживо, неповна ціна, помилки, оновлення ціни', async ({ page }) => {
    await register(page);
    await addPantry(page);
    await openDictionaries(page);

    await page.getByRole('button', { name: 'Додати страву' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Назва').fill('Гречка варена');
    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    await chooseProduct(page, 1, 'Гречка');
    await dialog.getByLabel('Кількість 1').fill('0,15');
    await expect(dialog.getByTestId('dish-line').first()).toContainText('кг');
    await expect(dialog.getByTestId('dish-line-total').first()).toHaveText(/^6,00/);

    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    // Продукт, вибраний в іншому рядку, недоступний.
    await dialog.getByRole('combobox', { name: 'Продукт 2' }).click();
    await expect(page.getByRole('option', { name: 'Гречка' })).toBeDisabled();
    await page.getByRole('option', { name: 'Олія' }).click();
    await dialog.getByLabel('Кількість 2').fill('0.01');
    await expect(dialog.getByTestId('dish-line-total').nth(1)).toHaveText(/^0,90/);
    await expect(dialog.getByTestId('dish-portion-price')).toHaveText(/^6,90/);
    await expect(dialog.getByTestId('incomplete-price')).toHaveCount(0);

    // Некоректні кількості не дають зберегти.
    for (const quantity of ['0', 'абв', '0,1234']) {
      await dialog.getByLabel('Кількість 2').fill(quantity);
      await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
      await expect(
        dialog.getByText(/Кількість має бути більшою за нуль|Некоректна кількість/),
      ).toBeVisible();
      await expect(dialog).toBeVisible();
    }
    await dialog.getByLabel('Кількість 2').fill('0,01');
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();

    const buckwheat = page.getByTestId('dish').filter({ hasText: 'Гречка варена' });
    await expect(buckwheat).toContainText('2 продукти');
    await expect(buckwheat).toContainText('за порцію');
    await expect(buckwheat.getByTestId('dish-price')).toHaveText(/^6,90/);
    await expect(buckwheat.getByTestId('incomplete-price')).toHaveCount(0);

    // Страва з продуктом без ціни.
    await page.getByRole('button', { name: 'Додати страву' }).click();
    await dialog.getByLabel('Назва').fill('Гречка з сіллю');
    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    await chooseProduct(page, 1, 'Гречка');
    await dialog.getByLabel('Кількість 1').fill('0,15');
    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    await chooseProduct(page, 2, 'Сіль');
    await dialog.getByLabel('Кількість 2').fill('0,005');
    await expect(dialog.getByTestId('dish-line-total').nth(1)).toHaveText('—');
    await expect(dialog.getByTestId('incomplete-price')).toBeVisible();
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();
    const salted = page.getByTestId('dish').filter({ hasText: 'Гречка з сіллю' });
    await expect(salted.getByTestId('incomplete-price')).toHaveText(/Ціна неповна/);
    await expect(salted.getByTestId('incomplete-price')).toHaveAttribute(
      'title',
      '1 продукт без ціни',
    );

    // Редагування відкриває склад; позначка видна й у діалозі.
    await page.getByRole('button', { name: 'Редагувати «Гречка з сіллю»' }).click();
    await expect(dialog.getByLabel('Кількість 2')).toHaveValue('0,005');
    await expect(dialog.getByTestId('incomplete-price')).toBeVisible();
    await page.keyboard.press('Escape');

    // Нова ціна продукту — нова ціна порції без перезавантаження.
    await openShopping(page);
    await page.getByRole('link', { name: 'Продукти', exact: true }).click();
    await page.getByRole('button', { name: 'Змінити «Гречка»' }).click();
    await dialog.getByLabel(/^Ціна за/).fill('50');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await openDictionaries(page);
    await expect(buckwheat.getByTestId('dish-price')).toHaveText(/^8,40/);

    // Продукт зі складу не видаляється.
    await page.goto('/menu/products');
    await page.getByRole('button', { name: 'Видалити продукт «Сіль»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(
      page.getByText(/використовується в списках покупок, стравах або меню/),
    ).toBeVisible();

    await openDictionaries(page);
    await page.getByRole('button', { name: 'Видалити страву «Гречка з сіллю»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByTestId('dish')).toHaveCount(1);
  });

  test('без продуктів діалог страви веде на сторінку «Продукти»', async ({ page }) => {
    await register(page);
    await openDictionaries(page);
    await page.getByRole('button', { name: 'Додати страву' }).click();
    await page
      .getByRole('dialog')
      .getByRole('link', { name: /Продукти/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();
  });
});

test.describe('телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('меню на 390px: шторка, дії через «⋯», без прокрутки вбік', async ({ page }) => {
    await register(page);
    await addPantry(page);
    await openDictionaries(page);
    await expect(page.getByRole('banner')).toContainText('· Меню');
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря']);

    // Додати й переставити.
    await page.getByRole('button', { name: 'Додати прийом їжі' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Назва').fill('Перекус');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Вгору «Перекус»' }).click();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Перекус', 'Вечеря']);

    // Перейменувати й видалити через «⋯».
    await page.getByRole('button', { name: 'Дії з прийомом їжі «Перекус»' }).click();
    await page.getByRole('menuitem', { name: 'Перейменувати' }).click();
    await dialog.getByLabel('Назва').fill('Полуденок');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Дії з прийомом їжі «Полуденок»' }).click();
    await page.getByRole('menuitem', { name: 'Видалити' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря']);

    // Діалог страви — шторка знизу; рядок складу переноситься на два рядки.
    await page.getByRole('button', { name: 'Додати страву' }).click();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box && [box.width, Math.round(box.y + box.height)];
      })
      .toEqual([390, 844]);
    await dialog.getByLabel('Назва').fill('Каша');
    expect((await dialog.getByLabel('Назва').boundingBox())?.height).toBe(40);
    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    await chooseProduct(page, 1, 'Гречка');
    await dialog.getByLabel('Кількість 1').fill('0,15');
    const product = await dialog.getByRole('combobox', { name: 'Продукт 1' }).boundingBox();
    const quantity = await dialog.getByLabel('Кількість 1').boundingBox();
    expect(product!.height).toBe(40);
    expect(quantity!.height).toBe(40);
    expect(quantity!.y).toBeGreaterThan(product!.y + product!.height - 1);
    await expect(dialog.getByRole('button', { name: 'Прибрати продукт 1' })).toBeInViewport();
    await expect(dialog.getByTestId('dish-portion-price')).toHaveText(/^6,00/);
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('dish').getByTestId('dish-price')).toHaveText(/^6,00/);

    // Редагувати й видалити страву через «⋯».
    await page.getByRole('button', { name: 'Дії зі стравою «Каша»' }).click();
    await page.getByRole('menuitem', { name: 'Редагувати' }).click();
    await dialog.getByLabel('Кількість 1').fill('0,2');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('dish').getByTestId('dish-price')).toHaveText(/^8,00/);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.getByRole('button', { name: 'Дії зі стравою «Каша»' }).click();
    await page.getByRole('menuitem', { name: 'Видалити' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText('Страв ще немає')).toBeVisible();
  });
});

// --- Календар меню ---

/** Сьогодні в часовому поясі користувача (у тестах — Europe/Kyiv). */
const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());

/** Страва через довідник: рядки [продукт, кількість на порцію]. */
async function addDish(page: Page, name: string, lines: [string, string][]) {
  await page.getByRole('button', { name: 'Додати страву' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill(name);
  for (const [index, [product, quantity]] of lines.entries()) {
    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    await chooseProduct(page, index + 1, product);
    await dialog.getByLabel(`Кількість ${index + 1}`).fill(quantity);
  }
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** «Гречка варена» — 6,90 грн за порцію; «Гречка з сіллю» — 6,00 грн, ціна неповна. */
async function addDishes(page: Page) {
  await addPantry(page);
  await openDictionaries(page);
  await addDish(page, 'Гречка варена', [
    ['Гречка', '0,15'],
    ['Олія', '0,01'],
  ]);
  await addDish(page, 'Гречка з сіллю', [
    ['Гречка', '0,15'],
    ['Сіль', '0,005'],
  ]);
}

const day = (page: Page, date: string) =>
  page.locator(`[data-testid="menu-day"][data-date="${date}"]`);
const meal = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const entry = (page: Page, dish: string) =>
  page.getByTestId('menu-entry').filter({ hasText: dish });

/** Додає страву в прийом їжі вибраного дня через «Додати». */
async function addEntry(page: Page, mealName: string, dish: string, servings = '1') {
  await meal(page, mealName).getByRole('button', { name: 'Додати', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(`^${dish} —`) }).click();
  await dialog.getByLabel('Порції').fill(servings);
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('календар меню, десктоп', () => {
  test('сьогодні вибрано, додавання, порції, прибирання, неповна ціна, 409, місяці', async ({
    page,
  }) => {
    await register(page);
    await addDishes(page);

    // Пункт «Меню» відкриває календар поточного місяця з вибраним сьогоднішнім днем.
    await goTo(page, 'Меню');
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole('link', { name: 'Меню', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const today = todayKey();
    await expect(day(page, today)).toHaveAttribute('aria-current', 'date');
    await expect(day(page, today)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Дні місяця' })).toContainText(
      /^Пн\s*Вт\s*Ср\s*Чт\s*Пт\s*Сб\s*Нд/,
    );

    // Інший день через параметр адреси; вибір дня.
    await page.goto('/menu?date=2026-10-27');
    await day(page, '2026-10-26').click();
    await expect(page).toHaveURL(/date=2026-10-26/);
    await expect(day(page, '2026-10-26')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'понеділок, 26 жовтня' })).toBeVisible();
    await expect(meal(page, 'Обід')).toContainText('Нічого не заплановано');

    // Некоректні порції — помилка біля поля, без запиту.
    await meal(page, 'Обід').getByRole('button', { name: 'Додати', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Гречка варена — 6,90/ }).click();
    for (const servings of ['0', '100', '1,5', 'абв']) {
      await dialog.getByLabel('Порції').fill(servings);
      await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
      await expect(dialog.getByText('Вкажіть ціле число порцій від 1 до 99')).toBeVisible();
    }
    await dialog.getByLabel('Порції').fill('2');
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('menu-entry')).toHaveCount(1);

    const buckwheat = entry(page, 'Гречка варена');
    await expect(buckwheat.getByTestId('servings')).toHaveText('2 порції');
    await expect(buckwheat.getByTestId('entry-cost')).toHaveText(/^13,80/);
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^13,80/);
    await expect(day(page, '2026-10-26').getByTestId('menu-day-cost')).toHaveText(/^13,80/);
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^13,80/);

    await page.reload();
    await expect(buckwheat.getByTestId('servings')).toHaveText('2 порції');
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^13,80/);

    // «+» і «−»; «−» неактивна на 1 порції.
    await buckwheat.getByRole('button', { name: 'Більше порцій' }).click();
    await expect(buckwheat.getByTestId('servings')).toHaveText('3 порції');
    await expect(buckwheat.getByTestId('entry-cost')).toHaveText(/^20,70/);
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^20,70/);
    await buckwheat.getByRole('button', { name: 'Менше порцій' }).click();
    await expect(buckwheat.getByTestId('servings')).toHaveText('2 порції');
    await buckwheat.getByRole('button', { name: 'Менше порцій' }).click();
    await expect(buckwheat.getByTestId('servings')).toHaveText('1 порція');
    await expect(buckwheat.getByRole('button', { name: 'Менше порцій' })).toBeDisabled();
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^6,90/);

    // Страва з продуктом без ціни: позначка біля запису, дня, клітинки й місяця.
    await expect(page.getByTestId('incomplete-price')).toHaveCount(0);
    await addEntry(page, 'Вечеря', 'Гречка з сіллю');
    const salted = entry(page, 'Гречка з сіллю');
    await expect(salted.getByTestId('incomplete-price')).toBeVisible();
    await expect(page.getByTestId('menu-day-panel').getByTestId('incomplete-price')).toHaveCount(2);
    await expect(day(page, '2026-10-26').getByTestId('incomplete-price')).toBeVisible();
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^12,90/);
    await expect(
      page
        .locator('main')
        .getByTestId('incomplete-price')
        .filter({ hasText: /з неповною ціною/ }),
    ).toHaveAttribute('title', '1 запис з неповною ціною');

    // Страву з меню не видалити в довідниках.
    await page.getByRole('link', { name: 'Страви й прийоми їжі' }).click();
    await page.getByRole('button', { name: 'Видалити страву «Гречка варена»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(
      page.getByText('Страва є в меню. Приберіть її з календаря, щоб видалити'),
    ).toBeVisible();
    await expect(page.getByTestId('dish')).toHaveCount(2);
    await page.getByRole('link', { name: 'До календаря' }).click();
    await expect(page).toHaveURL(/\/menu$/);

    // «Прибрати» зменшує вартість дня й місяця.
    await page.goto('/menu?date=2026-10-26');
    await salted.getByRole('button', { name: 'Прибрати' }).click();
    await expect(salted).toHaveCount(0);
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^6,90/);
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^6,90/);
    await expect(page.getByTestId('incomplete-price')).toHaveCount(0);

    // Інший місяць: записи жовтня зникають, листопадові з'являються.
    await page.getByRole('button', { name: 'Наступний місяць' }).click();
    await expect(page.getByTestId('current-month')).toHaveText('Листопад 2026');
    await expect(day(page, '2026-11-01')).toHaveAttribute('aria-pressed', 'true');
    await expect(day(page, '2026-10-26')).toHaveCount(0);
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^0,00/);
    await day(page, '2026-11-03').click();
    await addEntry(page, 'Сніданок', 'Гречка з сіллю', '2');
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^12,00/);
    await page.getByRole('button', { name: 'Попередній місяць' }).click();
    await expect(page.getByTestId('current-month')).toHaveText('Жовтень 2026');
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^6,90/);
    await expect(day(page, '2026-10-26').getByTestId('menu-day-cost')).toHaveText(/^6,90/);
  });

  test('друк меню на день: аркуш без навігації й сум', async ({ page }) => {
    await register(page);
    await addDishes(page);
    await page.goto('/menu?date=2026-10-26');
    await addEntry(page, 'Обід', 'Гречка варена', '2');
    await addEntry(page, 'Сніданок', 'Гречка з сіллю', '1');
    await addEntry(page, 'Сніданок', 'Гречка варена', '5');

    await page.getByRole('link', { name: 'Друк' }).click();
    await expect(page).toHaveURL(/\/menu\/print\/2026-10-26$/);
    await page.evaluate(() => {
      (window as unknown as { printCalls: number }).printCalls = 0;
      window.print = () => {
        (window as unknown as { printCalls: number }).printCalls += 1;
      };
    });
    await expect(page.getByRole('heading', { name: 'Меню', level: 1 })).toBeVisible();
    await expect(page.getByTestId('print-date')).toHaveText('понеділок, 26 жовтня 2026');
    await expect(page).toHaveTitle('Меню — 26.10.2026');
    await expect(page.getByTestId('print-meal').locator('h2')).toHaveText(['Сніданок', 'Обід']);
    await expect(page.getByTestId('print-entry')).toHaveText([
      'Гречка варена — 5 порцій',
      'Гречка з сіллю — 1 порція',
      'Гречка варена — 2 порції',
    ]);
    // Без сайдбару, шапки застосунку й сум.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('грн');

    await page.getByRole('button', { name: 'Друкувати' }).click();
    expect(
      await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls),
    ).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('print-toolbar')).toBeHidden();
    await expect(page.getByTestId('print-entry').first()).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    await page.getByRole('link', { name: 'До меню' }).click();
    await expect(page).toHaveURL(/\/menu\?date=2026-10-26$/);
    await expect(day(page, '2026-10-26')).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/menu/print/2026-10-27');
    await expect(page.getByText('На цей день меню не заплановано')).toBeVisible();
    await page.goto('/menu/print/2026-02-30');
    await expect(page.getByText('Невірна дата')).toBeVisible();
  });

  test('без страв діалог веде в довідники', async ({ page }) => {
    await register(page);
    await goTo(page, 'Меню');
    await meal(page, 'Обід').getByRole('button', { name: 'Додати', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('link', { name: 'Додати страви в довідниках' })
      .click();
    await expect(page).toHaveURL(/\/menu\/dictionaries$/);
  });
});

test.describe('календар меню, телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('календар на 390px: 7 колонок, панель під сіткою, шторка, дії й друк', async ({ page }) => {
    await register(page);
    await addPantry(page);
    await openDictionaries(page);
    await addDish(page, 'Гречка варена', [
      ['Гречка', '0,15'],
      ['Олія', '0,01'],
    ]);
    await page.goto('/menu?date=2026-10-26');
    const noHorizontalScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    // Сітка: 7 колонок у межах екрана, клітинки не нижчі за 40px.
    for (const box of await Promise.all(
      (await page.getByTestId('menu-day').all()).map((cell) => cell.boundingBox()),
    )) {
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
    const monday = await day(page, '2026-10-26').boundingBox();
    const sunday = await day(page, '2026-11-01').count();
    expect(sunday).toBe(0);
    const saturday = await day(page, '2026-10-31').boundingBox();
    expect(saturday!.x).toBeGreaterThan(monday!.x + 4 * monday!.width);

    // Панель дня — під сіткою.
    const lastCell = await day(page, '2026-10-31').boundingBox();
    const panel = await page.getByTestId('menu-day-panel').boundingBox();
    expect(panel!.y).toBeGreaterThan(lastCell!.y + lastCell!.height - 1);
    expect(await noHorizontalScroll()).toBe(true);

    // Діалог додавання — шторка знизу.
    await meal(page, 'Обід').getByRole('button', { name: 'Додати', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box && [box.width, Math.round(box.y + box.height)];
      })
      .toEqual([390, 844]);
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Гречка варена —/ }).click();
    await dialog.getByLabel('Порції').fill('2');
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();

    // У клітинці — крапка, без суми.
    await expect(day(page, '2026-10-26').getByTestId('menu-day-dot')).toBeVisible();
    await expect(day(page, '2026-10-26').getByTestId('menu-day-cost')).toBeHidden();

    // Рядок запису: назва, під нею порції, вартість і «Прибрати».
    const buckwheat = entry(page, 'Гречка варена');
    const name = await buckwheat.getByText('Гречка варена').boundingBox();
    const plus = buckwheat.getByRole('button', { name: 'Більше порцій' });
    // Кнопки панелі дня на телефоні — 40px.
    for (const button of [
      buckwheat.getByRole('button', { name: 'Менше порцій' }),
      buckwheat.getByRole('button', { name: 'Більше порцій' }),
      buckwheat.getByRole('button', { name: 'Прибрати' }),
      meal(page, 'Обід').getByRole('button', { name: 'Додати', exact: true }),
      page.getByRole('link', { name: 'Друк' }),
    ]) {
      expect((await button.boundingBox())!.height).toBe(40);
    }
    expect((await plus.boundingBox())!.width).toBe(40);
    expect((await plus.boundingBox())!.y).toBeGreaterThan(name!.y + name!.height - 1);
    await plus.click();
    await expect(buckwheat.getByTestId('servings')).toHaveText('3 порції');
    await expect(buckwheat.getByTestId('entry-cost')).toHaveText(/^20,70/);
    await expect(buckwheat.getByRole('button', { name: 'Прибрати' })).toBeInViewport();
    expect(await noHorizontalScroll()).toBe(true);

    await page.getByRole('link', { name: 'Друк' }).click();
    await expect(page).toHaveURL(/\/menu\/print\/2026-10-26$/);
    await expect(page.getByTestId('print-entry')).toHaveText(['Гречка варена — 3 порції']);
    expect(await noHorizontalScroll()).toBe(true);
    await page.getByRole('link', { name: 'До меню' }).click();

    await buckwheat.getByRole('button', { name: 'Прибрати' }).click();
    await expect(buckwheat).toHaveCount(0);
    await expect(meal(page, 'Обід')).toContainText('Нічого не заплановано');
  });
});

const shoppingItems = (page: Page) => page.getByTestId('menu-shopping-item');
const shoppingItem = (page: Page, name: string) =>
  shoppingItems(page).filter({ has: page.getByTestId('menu-shopping-name').getByText(name) });
const periodButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Період' }).getByRole('button', { name, exact: true });

test.describe('покупки за меню, десктоп', () => {
  test('перелік і бюджет за тиждень, день і місяць; створення списку', async ({ page }) => {
    await register(page);
    await addDishes(page);
    // Тиждень 26.10–01.11: гречка варена 2 порції в середу, гречка з сіллю ввечері в неділю.
    await page.goto('/menu?date=2026-10-28');
    await addEntry(page, 'Обід', 'Гречка варена', '2');
    await page.goto('/menu?date=2026-11-01');
    await addEntry(page, 'Вечеря', 'Гречка з сіллю');
    // Наступний тиждень: одна порція гречки вареної.
    await page.goto('/menu?date=2026-11-03');
    await addEntry(page, 'Сніданок', 'Гречка варена');

    // AC15: з календаря — тиждень пн–нд вибраного дня, пункт «Меню» активний.
    await page.goto('/menu?date=2026-10-28');
    await page.getByRole('link', { name: 'Покупки за меню' }).click();
    await expect(page).toHaveURL(/\/menu\/shopping\?period=week&date=2026-10-28$/);
    await expect(page.getByRole('heading', { name: 'Покупки за меню', level: 2 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Меню', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(periodButton(page, 'Тиждень')).toHaveAttribute('aria-pressed', 'true');
    await expect(periodButton(page, 'День')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('menu-shopping-period')).toHaveText(
      '26 жовтня – 1 листопада 2026',
    );

    // AC17: сумарні кількості, продукт без ціни, бюджет із позначкою.
    await expect(shoppingItems(page).getByTestId('menu-shopping-name')).toHaveText([
      'Гречка',
      'Олія',
      'Сіль',
    ]);
    const buckwheat = shoppingItem(page, 'Гречка');
    await expect(buckwheat.getByTestId('menu-shopping-quantity')).toHaveText('0,45 кг');
    await expect(buckwheat.getByTestId('menu-shopping-unit-price')).toHaveText(/^40,00.* \/ кг$/);
    await expect(buckwheat.getByTestId('menu-shopping-line-total')).toHaveText(/^18,00/);
    await expect(shoppingItem(page, 'Олія').getByTestId('menu-shopping-quantity')).toHaveText(
      '0,02 л',
    );
    const salt = shoppingItem(page, 'Сіль');
    await expect(salt.getByTestId('menu-shopping-quantity')).toHaveText('0,005 кг');
    await expect(salt.getByTestId('menu-shopping-unit-price')).toHaveText('немає ціни');
    await expect(salt.getByTestId('menu-shopping-line-total')).toHaveText('—');
    const budget = page.getByTestId('menu-shopping-budget');
    await expect(budget).toContainText('Бюджет на продукти');
    await expect(budget).toContainText('19,80');
    await expect(budget.getByTestId('incomplete-price')).toContainText('Ціна неповна');
    await expect(page.getByTestId('menu-shopping-unpriced')).toHaveText(
      'Без ціни: 1 продукт — пораховано як 0',
    );

    // AC16: «›» — наступний тиждень; перезавантаження зберігає період.
    await page.getByRole('button', { name: 'Наступний період' }).click();
    await expect(page).toHaveURL(/period=week&date=2026-11-02$/);
    await expect(page.getByTestId('menu-shopping-period')).toHaveText(
      '2 листопада – 8 листопада 2026',
    );
    await expect(shoppingItems(page).getByTestId('menu-shopping-name')).toHaveText([
      'Гречка',
      'Олія',
    ]);
    await expect(budget).toContainText('6,90');
    await expect(page.getByTestId('menu-shopping-unpriced')).toHaveCount(0);
    await expect(budget.getByTestId('incomplete-price')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('menu-shopping-period')).toHaveText(
      '2 листопада – 8 листопада 2026',
    );
    await expect(budget).toContainText('6,90');

    // День: 2 листопада меню порожнє (AC19) — кнопки створення немає.
    await periodButton(page, 'День').click();
    await expect(page).toHaveURL(/period=day&date=2026-11-02$/);
    await expect(periodButton(page, 'День')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('menu-shopping-period')).toHaveText(
      'понеділок, 2 листопада 2026',
    );
    await expect(page.getByText('За цей період у меню немає продуктів')).toBeVisible();
    await expect(shoppingItems(page)).toHaveCount(0);
    await expect(budget).toContainText('0,00');
    await expect(page.getByRole('button', { name: 'Створити список покупок' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Наступний період' }).click();
    await expect(page).toHaveURL(/period=day&date=2026-11-03$/);
    await expect(budget).toContainText('6,90');

    // Місяць і «‹».
    await periodButton(page, 'Місяць').click();
    await expect(page).toHaveURL(/period=month&date=2026-11-03$/);
    await expect(page.getByTestId('menu-shopping-period')).toHaveText('листопад 2026');
    await expect(budget).toContainText('Ціна неповна');
    await expect(budget).toContainText('12,90');
    await page.getByRole('button', { name: 'Попередній період' }).click();
    await expect(page).toHaveURL(/period=month&date=2026-10-01$/);
    await expect(page.getByTestId('menu-shopping-period')).toHaveText('жовтень 2026');
    await expect(budget).toContainText('13,80');

    // AC18: створення списку; кнопка неактивна, поки запит виконується.
    await page.goto('/menu/shopping?period=week&date=2026-10-28');
    await expect(shoppingItems(page)).toHaveCount(3);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/menu/shopping-list', async (route) => {
      await held;
      await route.continue();
    });
    const createButton = page.getByRole('button', { name: 'Створити список покупок' });
    await createButton.click();
    await expect(createButton).toBeDisabled();
    release();
    await expect(page).toHaveURL(/\/menu\/lists\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Меню 26.10.2026–01.11.2026' })).toBeVisible();
    const items = page.getByTestId('shopping-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Гречка');
    await expect(items.nth(0)).toContainText('0,45 кг');
    await expect(items.nth(1)).toContainText('Олія');
    await expect(items.nth(1)).toContainText('0,02 л');
    await expect(items.nth(2)).toContainText('Сіль');
    await expect(items.nth(2)).toContainText('0,005 кг');
    await expect(page.getByTestId('shopping-totals')).toContainText('19,80');

    // Список видно серед списків покупок; «До календаря» повертає на /menu.
    await openShopping(page);
    await expect(page.getByText('Меню 26.10.2026–01.11.2026')).toBeVisible();
    await page.goto('/menu/shopping?period=week&date=2026-10-28');
    await page.getByRole('link', { name: 'До календаря' }).click();
    await expect(page).toHaveURL(/\/menu\?date=2026-10-26$/);
    await expect(day(page, '2026-10-26')).toHaveAttribute('aria-pressed', 'true');
  });

  test('порожнє меню: текст із посиланням на календар, без кнопки створення', async ({ page }) => {
    await register(page);
    await page.goto('/menu/shopping');
    // Без параметрів — тиждень, у який входить сьогодні.
    await expect(periodButton(page, 'Тиждень')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('За цей період у меню немає продуктів')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Створити список покупок' })).toHaveCount(0);
    await expect(page.getByTestId('menu-shopping-budget')).toContainText('0,00');
    await page.getByRole('link', { name: 'Відкрити календар' }).click();
    // Календар відкривається на понеділку поточного тижня.
    await expect(page).toHaveURL(/\/menu\?date=\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole('heading', { name: 'Меню', level: 1 })).toBeVisible();
  });
});

test.describe('покупки за меню, телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('покупки за меню на 390px: без прокрутки вбік, кнопки 40px, створення', async ({ page }) => {
    await register(page);
    await addPantry(page);
    await openDictionaries(page);
    await addDish(page, 'Гречка з сіллю', [
      ['Гречка', '0,15'],
      ['Сіль', '0,005'],
    ]);
    await page.goto('/menu?date=2026-10-26');
    await addEntry(page, 'Обід', 'Гречка з сіллю', '2');

    await page.getByRole('link', { name: 'Покупки за меню' }).click();
    await expect(page).toHaveURL(/\/menu\/shopping\?period=week&date=2026-10-26$/);
    await expect(shoppingItems(page)).toHaveCount(2);
    const noHorizontalScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noHorizontalScroll()).toBe(true);

    const createButton = page.getByRole('button', { name: 'Створити список покупок' });
    for (const control of [
      periodButton(page, 'День'),
      periodButton(page, 'Тиждень'),
      periodButton(page, 'Місяць'),
      page.getByRole('button', { name: 'Попередній період' }),
      page.getByRole('button', { name: 'Наступний період' }),
      page.getByRole('link', { name: 'До календаря' }),
      createButton,
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    // Рядок продукту: назва, під нею кількість і сума.
    const buckwheat = shoppingItem(page, 'Гречка');
    const name = (await buckwheat.getByTestId('menu-shopping-name').boundingBox())!;
    const quantity = (await buckwheat.getByTestId('menu-shopping-quantity').boundingBox())!;
    const lineTotal = (await buckwheat.getByTestId('menu-shopping-line-total').boundingBox())!;
    expect(quantity.y).toBeGreaterThan(name.y + name.height - 1);
    expect(lineTotal.y).toBeGreaterThan(quantity.y + quantity.height - 1);
    await expect(buckwheat.getByTestId('menu-shopping-line-total')).toHaveText(/^12,00/);
    await expect(page.getByTestId('menu-shopping-budget')).toContainText('12,00');
    await expect(page.getByTestId('menu-shopping-unpriced')).toHaveText(
      'Без ціни: 1 продукт — пораховано як 0',
    );

    // Кнопка створення — на всю ширину вмісту.
    const main = (await page.locator('main').boundingBox())!;
    const createBox = (await createButton.boundingBox())!;
    expect(createBox.width).toBeGreaterThan(main.width - 64);

    // Перемикання періоду на телефоні.
    await periodButton(page, 'Місяць').click();
    await expect(page.getByTestId('menu-shopping-period')).toHaveText('жовтень 2026');
    expect(await noHorizontalScroll()).toBe(true);
    await periodButton(page, 'Тиждень').click();
    await expect(page.getByTestId('menu-shopping-period')).toHaveText(
      '26 жовтня – 1 листопада 2026',
    );

    await createButton.click();
    await expect(page).toHaveURL(/\/menu\/lists\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('shopping-item')).toHaveCount(2);
    await expect(page.getByTestId('shopping-totals')).toContainText('12,00');
  });
});

// --- Продукти напряму в меню ---

/** Додає продукт у прийом їжі вибраного дня через «Додати» → «Продукт». */
async function addProductEntry(page: Page, mealName: string, product: string, quantity: string) {
  await meal(page, mealName).getByRole('button', { name: 'Додати', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Продукт', exact: true }).click();
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(`^${product} —`) }).click();
  await dialog.getByLabel(/^Кількість/).fill(quantity);
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Гречка, олія, сіль, а також молоко (л, 42 грн) і яйця (шт, 6,50 грн). */
async function addDairy(page: Page) {
  await addPantry(page);
  await addProduct(page, 'Молоко', 'л', '42');
  await addProduct(page, 'Яйця', 'шт', '6,50');
}

test.describe('продукти в меню, десктоп', () => {
  test('додавання продукту з кількістю, помилки, зміна кількості, прибирання', async ({ page }) => {
    await register(page);
    await addDairy(page);
    await page.goto('/menu?date=2026-10-26');
    let posts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/menu/entries')) posts += 1;
    });

    await meal(page, 'Сніданок').getByRole('button', { name: 'Додати', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Додати в меню' })).toBeVisible();
    const productKind = dialog.getByRole('button', { name: 'Продукт', exact: true });
    await productKind.click();
    await expect(productKind).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Страва', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // У списку — неархівні продукти з ціною або «немає ціни».
    await dialog.getByRole('combobox').click();
    await expect(page.getByRole('option', { name: 'Сіль — немає ціни' })).toBeVisible();
    await page.getByRole('option', { name: /^Молоко — 42,00/ }).click();
    await expect(dialog.getByLabel('Кількість, л')).toBeVisible();

    // Порожня, нульова й нечислова кількість — помилка під полем, запиту немає.
    for (const [quantity, message] of [
      ['', 'Вкажіть кількість'],
      ['0', 'Кількість має бути більшою за нуль'],
      ['абв', 'Некоректна кількість, приклад: 1,5'],
    ] as const) {
      await dialog.getByLabel('Кількість, л').fill(quantity);
      await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
      await expect(dialog.getByText(message)).toBeVisible();
    }
    expect(posts).toBe(0);
    await dialog.getByLabel('Кількість, л').fill('0,5');
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(posts).toBe(1);

    const milk = page.locator('[data-testid="menu-entry"][data-kind="product"]', {
      hasText: 'Молоко',
    });
    await expect(milk.getByTestId('quantity')).toHaveText('0,5 л');
    await expect(milk.getByTestId('entry-cost')).toHaveText(/^21,00/);
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^21,00/);
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^21,00/);

    // Кількість з крапкою.
    await addProductEntry(page, 'Сніданок', 'Олія', '1.5');
    await expect(entry(page, 'Олія').getByTestId('quantity')).toHaveText('1,5 л');
    await expect(entry(page, 'Олія').getByTestId('entry-cost')).toHaveText(/^135,00/);
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^156,00/);

    // Зміна кількості.
    await milk.getByRole('button', { name: 'Змінити кількість' }).click();
    await expect(dialog.getByLabel('Кількість, л')).toHaveValue('0,5');
    await dialog.getByLabel('Кількість, л').fill('0');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog.getByText('Кількість має бути більшою за нуль')).toBeVisible();
    await dialog.getByLabel('Кількість, л').fill('1');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await expect(milk.getByTestId('quantity')).toHaveText('1 л');
    await expect(milk.getByTestId('entry-cost')).toHaveText(/^42,00/);
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^177,00/);

    // Прибрати продукт з дня; у довіднику він лишається.
    await entry(page, 'Олія').getByRole('button', { name: 'Прибрати' }).click();
    await expect(entry(page, 'Олія')).toHaveCount(0);
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^42,00/);
    await page.reload();
    await expect(milk.getByTestId('quantity')).toHaveText('1 л');
    await page.goto('/menu/products');
    await expect(page.getByText('Олія')).toBeVisible();
  });

  test('продукти поруч зі стравами: порядок, друк і покупки за меню', async ({ page }) => {
    await register(page);
    await addDairy(page);
    await openDictionaries(page);
    await addDish(page, 'Каша гречана', [['Гречка', '0,1']]);
    await page.goto('/menu?date=2026-10-26');
    await addProductEntry(page, 'Сніданок', 'Яйця', '10');
    await addEntry(page, 'Сніданок', 'Каша гречана', '2');
    await addProductEntry(page, 'Сніданок', 'Молоко', '0,5');
    await addProductEntry(page, 'Обід', 'Гречка', '0,3');

    await expect(meal(page, 'Сніданок').getByTestId('menu-entry')).toHaveText([
      /^Каша гречана/,
      /^Молоко/,
      /^Яйця/,
    ]);
    await expect(entry(page, 'Яйця').getByTestId('quantity')).toHaveText('10 шт');
    // 2 × 0,1 × 40 + 0,5 × 42 + 10 × 6,50 + 0,3 × 40 = 8 + 21 + 65 + 12.
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^106,00/);

    // Друк: продукти з кількістю й одиницею, без сум.
    await page.getByRole('link', { name: 'Друк' }).click();
    await expect(page).toHaveURL(/\/menu\/print\/2026-10-26$/);
    await expect(page.getByTestId('print-entry')).toHaveText([
      'Каша гречана — 2 порції',
      'Молоко — 0,5 л',
      'Яйця — 10 шт',
      'Гречка — 0,3 кг',
    ]);
    await expect(page.locator('body')).not.toContainText('грн');
    await expect(page.locator('body')).not.toContainText('₴');

    // Покупки за меню: гречка зі страви й напряму — один рядок 0,5 кг.
    await page.goto('/menu/shopping?period=day&date=2026-10-26');
    await expect(shoppingItems(page).getByTestId('menu-shopping-name')).toHaveText([
      'Гречка',
      'Молоко',
      'Яйця',
    ]);
    await expect(shoppingItem(page, 'Гречка')).toContainText('0,5 кг');
    await expect(shoppingItem(page, 'Яйця')).toContainText('10 шт');
    await expect(page.getByTestId('menu-shopping-budget')).toContainText('106,00');
    await page.getByRole('button', { name: 'Створити список покупок' }).click();
    await expect(page).toHaveURL(/\/menu\/lists\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('shopping-item')).toHaveCount(3);
  });

  test('порожній довідник продуктів — посилання на «Продукти»', async ({ page }) => {
    await register(page);
    await page.goto('/menu?date=2026-10-26');
    await meal(page, 'Обід').getByRole('button', { name: 'Додати', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Продукт', exact: true }).click();
    await expect(dialog.getByText('У довіднику ще немає продуктів')).toBeVisible();
    await dialog.getByRole('link', { name: 'Додати продукти' }).click();
    await expect(page).toHaveURL(/\/menu\/products$/);
    await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();
  });
});

test.describe('продукти в меню, телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('шторка додавання продукту, рядок переноситься без обрізання', async ({ page }) => {
    await register(page);
    await addPantry(page);
    await addProduct(page, 'Молоко пастеризоване безлактозне 2,5%', 'л', '58');
    await page.goto('/menu?date=2026-10-26');
    const noHorizontalScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noHorizontalScroll()).toBe(true);

    await meal(page, 'Обід').getByRole('button', { name: 'Додати', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box && [box.width, Math.round(box.y + box.height)];
      })
      .toEqual([390, 844]);
    await dialog.getByRole('button', { name: 'Продукт', exact: true }).click();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: /^Молоко пастеризоване/ }).click();
    const quantity = dialog.getByLabel('Кількість, л');
    await expect(quantity).toBeInViewport();
    await quantity.fill('0,75');
    const submit = dialog.getByRole('button', { name: 'Додати', exact: true });
    await expect(submit).toBeInViewport();
    expect((await submit.boundingBox())!.height).toBe(40);
    await submit.click();
    await expect(dialog).toBeHidden();

    const row = entry(page, 'Молоко пастеризоване');
    await expect(row.getByTestId('quantity')).toHaveText('0,75 л');
    await expect(row.getByTestId('entry-cost')).toHaveText(/^43,50/);
    // Назва цілком у межах екрана, під нею кількість і кнопки.
    const name = row.getByText('Молоко пастеризоване безлактозне 2,5%');
    const nameBox = await name.boundingBox();
    expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(390);
    const amount = await row.getByTestId('quantity').boundingBox();
    expect(amount!.y).toBeGreaterThan(nameBox!.y + nameBox!.height - 1);
    for (const button of [
      row.getByRole('button', { name: 'Змінити кількість' }),
      row.getByRole('button', { name: 'Прибрати' }),
    ]) {
      await expect(button).toBeInViewport();
      expect((await button.boundingBox())!.height).toBe(40);
    }
    expect(await noHorizontalScroll()).toBe(true);
  });
});

const panelMeals = (page: Page) =>
  page.getByTestId('menu-day-panel').getByRole('heading', { level: 3 });

test.describe('місце нового прийому їжі, десктоп', () => {
  test('поле «Після»: вставка після обраного, за замовчуванням у кінець, стрілки', async ({
    page,
  }) => {
    await register(page);
    await openDictionaries(page);
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Обід', 'Вечеря']);

    // «Після» — усі прийоми в порядку довідника, обрано останній.
    await page.getByRole('button', { name: 'Додати прийом їжі' }).click();
    const dialog = page.getByRole('dialog');
    const after = dialog.getByRole('combobox', { name: 'Після' });
    await expect(after).toHaveText('Вечеря');
    await after.click();
    await expect(page.getByRole('option')).toHaveText(['Сніданок', 'Обід', 'Вечеря']);
    await page.getByRole('option', { name: 'Сніданок', exact: true }).click();
    await expect(after).toHaveText('Сніданок');
    await dialog.getByLabel('Назва').fill('Сніданок 2');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Сніданок 2', 'Обід', 'Вечеря']);

    // Без зміни «Після» — у кінець, як і раніше.
    await page.getByRole('button', { name: 'Додати прийом їжі' }).click();
    await expect(after).toHaveText('Вечеря');
    await dialog.getByLabel('Назва').fill('Перекус');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
    await expect(mealTypes(page)).toHaveText([
      'Сніданок',
      'Сніданок 2',
      'Обід',
      'Вечеря',
      'Перекус',
    ]);

    // Перейменування — без «Після» і без зміни місця.
    await page.getByRole('button', { name: 'Перейменувати «Сніданок 2»' }).click();
    await expect(dialog.getByLabel('Назва')).toHaveValue('Сніданок 2');
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await dialog.getByLabel('Назва').fill('Другий сніданок');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await expect(mealTypes(page)).toHaveText([
      'Сніданок',
      'Другий сніданок',
      'Обід',
      'Вечеря',
      'Перекус',
    ]);

    // Стрілки працюють і для вставленого запису.
    await page.getByRole('button', { name: 'Вниз «Другий сніданок»' }).click();
    await expect(mealTypes(page)).toHaveText([
      'Сніданок',
      'Обід',
      'Другий сніданок',
      'Вечеря',
      'Перекус',
    ]);
    await page.getByRole('button', { name: 'Вгору «Другий сніданок»' }).click();
    await expect(mealTypes(page)).toHaveText([
      'Сніданок',
      'Другий сніданок',
      'Обід',
      'Вечеря',
      'Перекус',
    ]);

    // У панелі дня календаря — той самий порядок.
    await page.goto('/menu?date=2026-10-26');
    await expect(panelMeals(page)).toHaveText([
      'Сніданок',
      'Другий сніданок',
      'Обід',
      'Вечеря',
      'Перекус',
    ]);
  });

  test('порожній довідник: поля «Після» немає, доданий прийом — єдиний', async ({ page }) => {
    await register(page);
    await openDictionaries(page);
    for (const name of ['Сніданок', 'Обід', 'Вечеря']) {
      await page.getByRole('button', { name: `Видалити прийом їжі «${name}»` }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
      await expect(page.getByRole('alertdialog')).toBeHidden();
    }
    await expect(mealTypes(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Додати прийом їжі' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Назва')).toBeVisible();
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByText('Після')).toHaveCount(0);
    await dialog.getByLabel('Назва').fill('Обід');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
    await expect(mealTypes(page)).toHaveText(['Обід']);
  });
});

test.describe('панель дня, десктоп', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('панель під сіткою на всю ширину, назва страви в один рядок', async ({ page }) => {
    const name = 'Гречка варена з грибами й цибулею';
    await register(page);
    await addPantry(page);
    await openDictionaries(page);
    await addDish(page, name, [['Гречка', '0,15']]);
    await page.goto('/menu?date=2026-10-26');
    await addEntry(page, 'Обід', name, '2');

    const grid = await page.getByRole('group', { name: 'Дні місяця' }).boundingBox();
    const lastCell = await day(page, '2026-10-31').boundingBox();
    const panel = await page.getByTestId('menu-day-panel').boundingBox();
    expect(panel!.y).toBeGreaterThan(lastCell!.y + lastCell!.height - 1);
    expect(Math.abs(panel!.width - grid!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.x - grid!.x)).toBeLessThanOrEqual(1);
    expect(panel!.width).toBeGreaterThan(24 * 16 + 1);

    // Назва — один рядок тексту.
    const title = entry(page, name).getByText(name, { exact: true });
    const lineHeight = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    const box = await title.boundingBox();
    expect(box!.height).toBeLessThan(lineHeight * 1.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test.describe('місце нового прийому їжі, телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('шторка з полем «Після» без прокрутки вбік', async ({ page }) => {
    await register(page);
    await openDictionaries(page);
    const noHorizontalScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    await page.getByRole('button', { name: 'Додати прийом їжі' }).click();
    const dialog = page.getByRole('dialog');
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box && [box.width, Math.round(box.y + box.height)];
      })
      .toEqual([390, 844]);
    const after = dialog.getByRole('combobox', { name: 'Після' });
    await expect(after).toHaveText('Вечеря');
    await after.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const list = await listbox.boundingBox();
    expect(list!.x).toBeGreaterThanOrEqual(0);
    expect(list!.x + list!.width).toBeLessThanOrEqual(390);
    expect(await noHorizontalScroll()).toBe(true);
    await page.getByRole('option', { name: 'Сніданок', exact: true }).click();
    await dialog.getByLabel('Назва').fill('Сніданок 2');
    await dialog.getByRole('button', { name: 'Додати' }).click();
    await expect(dialog).toBeHidden();
    await expect(mealTypes(page)).toHaveText(['Сніданок', 'Сніданок 2', 'Обід', 'Вечеря']);
    expect(await noHorizontalScroll()).toBe(true);
  });
});
