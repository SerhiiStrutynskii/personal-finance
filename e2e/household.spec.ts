import { expect, test, type Browser, type Page } from '@playwright/test';
import { addAccount, goTo, register } from './helpers.ts';

test('спільний доступ: запрошення за посиланням, права учасника, вилучення', async ({
  page,
  browser,
}) => {
  await register(page);
  await addAccount(page, 'Картка');

  // Власник створює посилання-запрошення.
  await goTo(page, 'Домогосподарство');
  await page.getByRole('button', { name: 'Перейменувати домогосподарство' }).click();
  const renameDialog = page.getByRole('dialog');
  await renameDialog.getByLabel('Назва').fill('Родина Тест');
  await renameDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(renameDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Родина Тест' })).toBeVisible();

  await page.getByRole('button', { name: 'Запросити' }).click();
  const linkDialog = page.getByRole('dialog');
  const link = await linkDialog.getByLabel('Посилання-запрошення').inputValue();
  expect(link).toMatch(/\/invite\/[\w-]{20,}$/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('household-invite')).toHaveCount(1);

  // Нова людина реєструється за посиланням в окремому браузері.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(link);
  await expect(member.getByText('Приєднатися до «Родина Тест»')).toBeVisible();
  await member.getByLabel('Імʼя').fill('Олена');
  await member.getByLabel('Email').fill(`e2e-member-${Date.now()}@example.com`);
  await member.getByLabel('Пароль').fill('e2e-password-123');
  await member.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(member.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();

  // Учасник бачить рахунок власника, але не змінює його.
  await goTo(member, 'Рахунки');
  await expect(member.getByText('Картка')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Додати рахунок' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: /Видалити рахунок/ })).toHaveCount(0);

  // Витрати учасник веде сам.
  await goTo(member, 'Витрати');
  await member.getByRole('button', { name: 'Додати', exact: true }).click();
  const expenseDialog = member.getByRole('dialog');
  await expenseDialog.getByLabel('Сума, UAH').fill('250');
  await expenseDialog.getByLabel('Опис').fill('Кава');
  await expenseDialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(expenseDialog).toBeHidden();

  // Власник бачить витрату учасника й нового учасника; посилання вже використане.
  await goTo(page, 'Витрати');
  await expect(page.getByText('Кава')).toBeVisible();
  await goTo(page, 'Домогосподарство');
  const members = page.getByTestId('household-member');
  await expect(members).toHaveCount(2);
  await expect(members.last()).toContainText('Олена');
  await expect(members.last()).toContainText('учасник');
  await expect(page.getByTestId('household-invite')).toHaveCount(0);

  // Учасник не бачить запрошень і кнопок керування.
  await goTo(member, 'Домогосподарство');
  await expect(member.getByRole('button', { name: 'Запросити' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Вийти з домогосподарства' })).toBeVisible();

  // Використане посилання більше не діє.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(link);
  await expect(strangerPage.getByTestId('invite-invalid')).toBeVisible();
  await stranger.close();

  // Власник вилучає учасника: той втрачає доступ до даних домогосподарства.
  await page.getByRole('button', { name: 'Вилучити «Олена» з домогосподарства' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Вилучити' }).click();
  await expect(members).toHaveCount(1);

  await member.reload();
  await goTo(member, 'Рахунки');
  await expect(member.getByText('Рахунків ще немає')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Додати рахунок' })).toBeVisible();
  await memberContext.close();
});

/** Власник створює посилання, а нова людина реєструється за ним в окремому браузері. */
async function inviteMember(page: Page, browser: Browser, name: string) {
  await goTo(page, 'Домогосподарство');
  await page.getByRole('button', { name: 'Запросити' }).click();
  const link = await page.getByRole('dialog').getByLabel('Посилання-запрошення').inputValue();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const context = await browser.newContext({ viewport: page.viewportSize() });
  const member = await context.newPage();
  await member.goto(link);
  await member.getByLabel('Імʼя').fill(name);
  await member.getByLabel('Email').fill(`e2e-member-${Date.now()}@example.com`);
  await member.getByLabel('Пароль').fill('e2e-password-123');
  await member.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(member.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();
  return { context, member };
}

const crown = (name: string) => ({ name: `Зробити «${name}» власником` });

test('передача ролі власника учаснику', async ({ page, browser }) => {
  await register(page);
  await addAccount(page, 'Картка');

  // Без інших учасників передавати нікому.
  await goTo(page, 'Домогосподарство');
  await expect(page.getByTestId('household-member')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /власником/ })).toHaveCount(0);

  const { context, member } = await inviteMember(page, browser, 'Олена');
  await page.reload();
  const members = page.getByTestId('household-member');
  await expect(members).toHaveCount(2);
  await expect(page.getByTestId('household-invite')).toHaveCount(0);
  await page.getByRole('button', { name: 'Запросити' }).click();
  await expect(page.getByRole('dialog').getByLabel('Посилання-запрошення')).toHaveValue(/invite/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('household-invite')).toHaveCount(1);

  // Кнопка передачі — лише біля іншого учасника.
  await expect(page.getByRole('button', crown('Олена'))).toBeVisible();
  await expect(page.getByRole('button', crown('Тест'))).toHaveCount(0);
  await expect(members.first().getByRole('button')).toHaveCount(0);

  // Учасник кнопки передачі не бачить ні в кого.
  await goTo(member, 'Домогосподарство');
  await expect(member.getByTestId('household-member')).toHaveCount(2);
  await expect(member.getByRole('button', { name: /власником/ })).toHaveCount(0);

  // «Скасувати» нічого не змінює.
  await page.getByRole('button', crown('Олена')).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Передати роль власника «Олена»?');
  await expect(confirm).toContainText('Ви станете учасником');
  await confirm.getByRole('button', { name: 'Скасувати' }).click();
  await expect(confirm).toBeHidden();
  await expect(members.first()).toContainText('власник');
  await expect(page.getByRole('button', { name: 'Запросити' })).toBeVisible();

  // Передача: сторінка одразу показує нові ролі й ховає дії власника.
  await page.getByRole('button', crown('Олена')).click();
  await confirm.getByRole('button', { name: 'Передати' }).click();
  await expect(confirm).toBeHidden();
  await expect(members.first()).toContainText('(ви)');
  await expect(members.first()).toContainText('учасник');
  await expect(members.last()).toContainText('Олена');
  await expect(members.last()).toContainText('власник');
  await expect(page.getByRole('button', { name: 'Запросити' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Перейменувати домогосподарство' })).toHaveCount(0);
  await expect(page.getByText('Активні запрошення')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Вилучити/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /власником/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Вийти з домогосподарства' })).toBeVisible();

  // Права на інших сторінках змінились без перезавантаження.
  await goTo(page, 'Рахунки');
  await expect(page.getByText('Картка').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Додати рахунок' })).toHaveCount(0);

  // Новий власник після перезавантаження керує домогосподарством.
  await member.reload();
  await goTo(member, 'Домогосподарство');
  await expect(member.getByRole('button', { name: 'Запросити' })).toBeVisible();
  await expect(member.getByTestId('household-invite')).toHaveCount(1);
  await expect(member.getByRole('button', crown('Тест'))).toBeVisible();
  await expect(
    member.getByRole('button', { name: 'Вилучити «Тест» з домогосподарства' }),
  ).toBeVisible();
  await expect(member.getByRole('button', { name: 'Вийти з домогосподарства' })).toHaveCount(0);
  await goTo(member, 'Рахунки');
  await expect(member.getByRole('button', { name: 'Додати рахунок' })).toBeVisible();
  await context.close();
});

test.describe('телефон', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('передача ролі власника на 390px без прокрутки вбік', async ({ page, browser }) => {
    await register(page);
    const { context } = await inviteMember(page, browser, 'Олександра-Вікторія');
    await page.reload();
    await expect(page.getByTestId('household-member')).toHaveCount(2);

    const row = page.getByTestId('household-member').last();
    await expect(row.getByRole('button', crown('Олександра-Вікторія'))).toBeVisible();
    await expect(row.getByRole('button', { name: /Вилучити/ })).toBeVisible();
    for (const button of await row.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );

    await row.getByRole('button', crown('Олександра-Вікторія')).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    const box = await confirm.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await expect(confirm.getByRole('button', { name: 'Передати' })).toBeInViewport();
    await confirm.getByRole('button', { name: 'Передати' }).click();
    await expect(confirm).toBeHidden();

    await expect(row).toContainText('власник');
    await expect(page.getByRole('button', { name: 'Вийти з домогосподарства' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await context.close();
  });
});
