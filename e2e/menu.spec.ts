import { expect, test, type Page } from '@playwright/test';
import { goTo, register } from './helpers.ts';

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
  await page.goto('/shopping/products');
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
  await expect(page.getByRole('heading', { name: 'Довідники меню', level: 1 })).toBeVisible();
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
    await goTo(page, 'Покупки');
    await page.getByRole('link', { name: 'Продукти', exact: true }).click();
    await page.getByRole('button', { name: 'Змінити «Гречка»' }).click();
    await dialog.getByLabel(/^Ціна за/).fill('50');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await openDictionaries(page);
    await expect(buckwheat.getByTestId('dish-price')).toHaveText(/^8,40/);

    // Продукт зі складу не видаляється.
    await page.goto('/shopping/products');
    await page.getByRole('button', { name: 'Видалити продукт «Сіль»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText(/використовується в списках покупок або стравах/)).toBeVisible();

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

/** Додає страву в прийом їжі вибраного дня через «Додати страву». */
async function addEntry(page: Page, mealName: string, dish: string, servings = '1') {
  await meal(page, mealName).getByRole('button', { name: 'Додати страву' }).click();
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
    await meal(page, 'Обід').getByRole('button', { name: 'Додати страву' }).click();
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
    ).toHaveAttribute('title', '1 страва з неповною ціною');

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
    await meal(page, 'Обід').getByRole('button', { name: 'Додати страву' }).click();
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
    await meal(page, 'Обід').getByRole('button', { name: 'Додати страву' }).click();
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
