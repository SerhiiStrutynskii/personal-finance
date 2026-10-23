import { expect, test } from '@playwright/test';
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
