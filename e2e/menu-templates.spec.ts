import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers.ts';

// Шаблони меню дня: зберегти день як шаблон, застосувати до іншого дня, керувати в довідниках.

/** Гречка (кг, 40 грн) і страви «Гречка варена» (6,00 грн за порцію) та «Гречка подвійна» (12,00). */
async function setup(page: Page) {
  await page.goto('/menu/products');
  await expect(page.getByRole('heading', { name: 'Продукти' })).toBeVisible();
  await page.getByRole('button', { name: 'Додати продукт' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Гречка');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'кг', exact: true }).click();
  await dialog.getByLabel(/^Ціна за/).fill('40');
  await dialog.getByRole('button', { name: 'Додати' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/menu/dictionaries');
  for (const [name, quantity] of [
    ['Гречка варена', '0,15'],
    ['Гречка подвійна', '0,3'],
  ] as const) {
    await page.getByRole('button', { name: 'Додати страву' }).click();
    await dialog.getByLabel('Назва').fill(name);
    await dialog.getByRole('button', { name: 'Додати продукт' }).click();
    await dialog.getByRole('combobox', { name: 'Продукт 1' }).click();
    await page.getByRole('option', { name: 'Гречка' }).click();
    await dialog.getByLabel('Кількість 1').fill(quantity);
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
}

const day = (page: Page, date: string) =>
  page.locator(`[data-testid="menu-day"][data-date="${date}"]`);
const meal = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const entries = (page: Page) => page.getByTestId('menu-entry');
const panel = (page: Page) => page.getByTestId('menu-day-panel');
const saveButton = (page: Page) => panel(page).getByRole('button', { name: 'Зберегти як шаблон' });
const applyButton = (page: Page) => panel(page).getByRole('button', { name: 'Застосувати шаблон' });

async function openDay(page: Page, date: string) {
  await page.goto(`/menu?date=${date}`);
  await expect(day(page, date)).toHaveAttribute('aria-pressed', 'true');
}

async function addEntry(page: Page, mealName: string, dish: string, servings = '1') {
  await meal(page, mealName).getByRole('button', { name: 'Додати', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: new RegExp(`^${dish} —`) }).click();
  await dialog.getByLabel('Порції').fill(servings);
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function saveTemplate(page: Page, name: string) {
  await saveButton(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Зберегти як шаблон' })).toBeVisible();
  await dialog.getByLabel('Назва').fill(name);
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
}

const noHorizontalScroll = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

test.describe('шаблони дня, десктоп', () => {
  test('збереження, застосування до порожнього й непорожнього дня, керування', async ({ page }) => {
    await register(page);
    await setup(page);
    const dialog = page.getByRole('dialog');

    // AC17: без шаблонів — підказка й без кнопки застосування; у порожньому дні збереження неактивне.
    await openDay(page, '2026-10-26');
    await expect(saveButton(page)).toBeDisabled();
    await applyButton(page).click();
    await expect(dialog.getByText('Шаблонів ще немає. Збережіть меню дня як шаблон')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Застосувати' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Замінити меню дня' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Скасувати' }).click();
    await expect(dialog).toBeHidden();

    // AC15: зберегти день як шаблон.
    await addEntry(page, 'Обід', 'Гречка варена', '2');
    await expect(saveButton(page)).toBeEnabled();
    await saveTemplate(page, '  Будній день ');
    await expect(dialog).toBeHidden();

    // AC17: дубль назви — помилка в діалозі, діалог не закривається.
    await saveTemplate(page, 'будній ДЕНЬ');
    await expect(dialog.getByText('Шаблон з такою назвою вже є')).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Скасувати' }).click();
    await expect(dialog).toBeHidden();

    // AC15: у порожньому дні — застосування без попередження; сітка показує вартість дня.
    await openDay(page, '2026-10-28');
    await expect(entries(page)).toHaveCount(0);
    await applyButton(page).click();
    await expect(dialog.getByRole('combobox')).toHaveText('Будній день · 1 позиція');
    await expect(dialog.getByTestId('template-replace-warning')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Замінити меню дня' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Застосувати', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(entries(page)).toHaveCount(1);
    await expect(meal(page, 'Обід').getByTestId('menu-entry')).toContainText('Гречка варена');
    await expect(meal(page, 'Обід').getByTestId('servings')).toHaveText('2 порції');
    await expect(page.getByTestId('menu-day-total')).toHaveText(/^12,00/);
    await expect(day(page, '2026-10-28').getByTestId('menu-day-cost')).toHaveText(/^12,00/);
    await expect(page.getByTestId('menu-month-total')).toHaveText(/^24,00/);

    // AC16: непорожній день — попередження з кількістю записів; «Скасувати» лишає день як був.
    await openDay(page, '2026-10-29');
    await addEntry(page, 'Вечеря', 'Гречка подвійна');
    await addEntry(page, 'Сніданок', 'Гречка варена', '3');
    await applyButton(page).click();
    await expect(dialog.getByTestId('template-replace-warning')).toHaveText(
      'Меню дня буде замінено: 2 записи зникнуть',
    );
    await expect(dialog.getByRole('button', { name: 'Застосувати', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Скасувати' }).click();
    await expect(dialog).toBeHidden();
    await expect(entries(page)).toHaveCount(2);
    await expect(meal(page, 'Вечеря')).toContainText('Гречка подвійна');

    await applyButton(page).click();
    await dialog.getByRole('button', { name: 'Замінити меню дня' }).click();
    await expect(dialog).toBeHidden();
    await expect(entries(page)).toHaveCount(1);
    await expect(meal(page, 'Вечеря')).toContainText('Нічого не заплановано');
    await expect(meal(page, 'Сніданок')).toContainText('Нічого не заплановано');
    await expect(meal(page, 'Обід').getByTestId('servings')).toHaveText('2 порції');
    await expect(day(page, '2026-10-29').getByTestId('menu-day-cost')).toHaveText(/^12,00/);

    // AC18: «Керувати шаблонами» → довідники, секція «Шаблони дня».
    await applyButton(page).click();
    await dialog.getByRole('link', { name: 'Керувати шаблонами' }).click();
    await expect(page).toHaveURL(/\/menu\/dictionaries#templates$/);
    const section = page.getByRole('region', { name: 'Шаблони дня' });
    await expect(section.getByRole('heading', { name: 'Шаблони дня' })).toBeInViewport();
    const rows = section.getByTestId('menu-template');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Будній день');
    await expect(rows).toContainText('1 позиція');

    // Перейменування.
    await section.getByRole('button', { name: 'Перейменувати «Будній день»' }).click();
    await expect(dialog.getByLabel('Назва')).toHaveValue('Будній день');
    await dialog.getByLabel('Назва').fill('Робочий день');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await expect(rows).toContainText('Робочий день');

    // Видалення з підтвердженням: «Скасувати» лишає, «Видалити» прибирає.
    await section.getByRole('button', { name: 'Видалити шаблон «Робочий день»' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText(
      'Шаблон зникне. Дні, до яких його застосували, не зміняться.',
    );
    await confirm.getByRole('button', { name: 'Скасувати' }).click();
    await expect(rows).toHaveCount(1);
    await section.getByRole('button', { name: 'Видалити шаблон «Робочий день»' }).click();
    await confirm.getByRole('button', { name: 'Видалити' }).click();
    await expect(rows).toHaveCount(0);
    await expect(
      section.getByText('Шаблонів ще немає. Збережіть меню дня в календарі'),
    ).toBeVisible();

    // День, до якого шаблон застосували, не змінився.
    await openDay(page, '2026-10-28');
    await expect(entries(page)).toHaveCount(1);
    await expect(meal(page, 'Обід').getByTestId('servings')).toHaveText('2 порції');
    await expect(day(page, '2026-10-28').getByTestId('menu-day-cost')).toHaveText(/^12,00/);
  });

  test('видалення страви попереджає про шаблони дня', async ({ page }) => {
    await register(page);
    await setup(page);
    await page.getByRole('button', { name: 'Видалити страву «Гречка подвійна»' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Позиції з нею зникнуть із шаблонів дня.',
    );
  });
});

test.describe('шаблони дня, телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('кнопки панелі 40px, діалоги шторкою, дії через «⋯», без прокрутки вбік', async ({
    page,
  }) => {
    await register(page);
    await setup(page);
    const dialog = page.getByRole('dialog');
    const sheet = () =>
      expect
        .poll(async () => {
          const box = await dialog.boundingBox();
          return box && [box.width, Math.round(box.y + box.height)];
        })
        .toEqual([390, 844]);

    await openDay(page, '2026-10-26');
    await addEntry(page, 'Обід', 'Гречка варена', '2');
    for (const name of ['Зберегти як шаблон', 'Застосувати шаблон', 'Друк']) {
      const button = panel(page).getByRole(name === 'Друк' ? 'link' : 'button', { name });
      await expect(button).toBeVisible();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    }
    // Кнопки — у рядку під заголовком панелі.
    const heading = await panel(page).getByRole('heading', { level: 2 }).boundingBox();
    const save = await saveButton(page).boundingBox();
    expect(save!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
    await noHorizontalScroll(page);

    await saveButton(page).click();
    await sheet();
    await dialog.getByLabel('Назва').fill('Будній день');
    expect((await dialog.getByRole('button', { name: 'Зберегти' }).boundingBox())!.height).toBe(40);
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();

    await openDay(page, '2026-10-27');
    await applyButton(page).click();
    await sheet();
    await expect(dialog.getByRole('combobox')).toHaveText('Будній день · 1 позиція');
    await dialog.getByRole('button', { name: 'Застосувати', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(entries(page)).toHaveCount(1);
    await noHorizontalScroll(page);

    await page.goto('/menu/dictionaries#templates');
    const section = page.getByRole('region', { name: 'Шаблони дня' });
    await expect(section.getByTestId('menu-template')).toContainText('Будній день');
    await expect(section.getByRole('button', { name: 'Перейменувати «Будній день»' })).toHaveCount(
      0,
    );
    await noHorizontalScroll(page);
    await section.getByRole('button', { name: 'Дії з шаблоном «Будній день»' }).click();
    await page.getByRole('menuitem', { name: 'Перейменувати' }).click();
    await sheet();
    await dialog.getByLabel('Назва').fill('Вихідний');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await expect(dialog).toBeHidden();
    await section.getByRole('button', { name: 'Дії з шаблоном «Вихідний»' }).click();
    await page.getByRole('menuitem', { name: 'Видалити' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(section.getByTestId('menu-template')).toHaveCount(0);
    await noHorizontalScroll(page);
  });
});
