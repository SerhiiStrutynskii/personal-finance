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

test.describe('десктоп', () => {
  test('прийоми їжі: типові, додати, перейменувати, переставити, видалити', async ({ page }) => {
    await register(page);
    await goTo(page, 'Меню');
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole('heading', { name: 'Меню', level: 1 })).toBeVisible();
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
    await goTo(page, 'Меню');

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
    await goTo(page, 'Меню');
    await expect(buckwheat.getByTestId('dish-price')).toHaveText(/^8,40/);

    // Продукт зі складу не видаляється.
    await page.goto('/shopping/products');
    await page.getByRole('button', { name: 'Видалити продукт «Сіль»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText(/використовується в списках покупок або стравах/)).toBeVisible();

    await goTo(page, 'Меню');
    await page.getByRole('button', { name: 'Видалити страву «Гречка з сіллю»' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByTestId('dish')).toHaveCount(1);
  });

  test('без продуктів діалог страви веде на сторінку «Продукти»', async ({ page }) => {
    await register(page);
    await goTo(page, 'Меню');
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
    await goTo(page, 'Меню');
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
