import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';
import {
  NOW,
  TODAY,
  balanceOfAccount,
  cardInput,
  createAccount,
  fund,
  loanInput,
} from './helpers.ts';

const { createActor, setNow } = setupTestApp();
beforeEach(() => setNow(NOW));

/** Кредитка з лімітом 50 000 грн, мінімальний платіж 1 200 грн 25-го, і дебетовий рахунок. */
async function setup(override: object = {}) {
  const actor = await createActor();
  const debit = await createAccount(actor);
  await fund(actor, debit.id, 3_000_000);
  const { body: card } = await actor.post('/api/debts', cardInput(override));
  const spend = (amountMinor: number, occurredAt = '2026-10-05T10:00:00Z') =>
    actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.accountId,
      amountMinor,
      occurredAt,
    });
  const repay = (body: object) =>
    actor.post(`/api/debts/${card.id}/card-payments`, {
      fromAccountId: debit.id,
      date: TODAY,
      ...body,
    });
  return { actor, debit, card: card as { id: string; accountId: string }, spend, repay };
}

const details = async (actor: Actor, id: string) => (await actor.get(`/api/debts/${id}`)).body;

describe('покупки з кредитки', () => {
  it('видаток з картки збільшує борг і використання ліміту', async () => {
    const { actor, card, spend } = await setup();
    expect((await spend(1_000_000)).status).toBe(201);

    expect(await details(actor, card.id)).toMatchObject({
      balance: 1_000_000,
      card: { creditLimit: 5_000_000, available: 4_000_000, usage: 0.2, nearLimit: false },
      // потрібний платіж — мінімальний, бо борг більший за нього
      month: { dueDate: '2026-10-25', required: 120_000, paid: 0, status: 'pending' },
    });
    expect(await balanceOfAccount(actor, card.accountId)).toBe(-1_000_000);
  });

  it('видаток понад ліміт не блокується', async () => {
    const { actor, card, spend } = await setup({ creditLimit: 100_000 });
    expect((await spend(95_000)).status).toBe(201);
    expect((await details(actor, card.id)).card).toMatchObject({ nearLimit: true, overLimitBy: 0 });

    expect((await spend(20_000)).status).toBe(201);
    expect((await details(actor, card.id)).card).toMatchObject({
      available: -15_000,
      overLimitBy: 15_000,
      usage: 1.15,
    });
  });

  it('потрібний платіж не перевищує борг', async () => {
    const { actor, card, spend } = await setup();
    await spend(50_000);
    expect((await details(actor, card.id)).month.required).toBe(50_000);
  });

  it('повернення коштів на картку зменшує борг', async () => {
    const { actor, card, spend } = await setup();
    await spend(100_000);
    await actor.post('/api/transactions', {
      type: 'income',
      accountId: card.accountId,
      amountMinor: 30_000,
      occurredAt: '2026-10-06T10:00:00Z',
    });
    expect((await details(actor, card.id)).balance).toBe(70_000);
  });

  it('історія кредитки — транзакції рахунку-картки', async () => {
    const { actor, card, spend, repay } = await setup({ initialAmount: 200_000 });
    await spend(100_000);
    await repay({ amount: 50_000 });
    const { transactions, entries } = await details(actor, card.id);
    expect(entries).toEqual([]);
    expect(transactions.map((item: { type: string }) => item.type)).toEqual([
      'transfer',
      'expense',
      'balance_adjustment',
    ]);
  });
});

describe('погашення кредитки', () => {
  it('переказ на картку зменшує борг і зараховується в сплачене за місяць', async () => {
    const { actor, debit, card, spend, repay } = await setup();
    await spend(1_000_000);

    const res = await repay({ amount: 120_000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      balance: 880_000,
      month: { required: 120_000, paid: 120_000, status: 'paid' },
    });
    expect(await balanceOfAccount(actor, debit.id)).toBe(2_880_000);

    const { body: transfers } = await actor.get('/api/transactions?type=transfer');
    expect(transfers.items).toEqual([
      expect.objectContaining({
        accountId: debit.id,
        toAccountId: card.accountId,
        amountMinor: 120_000,
        description: 'Погашення: Кредитка',
        categoryId: null,
        debtId: null,
      }),
    ]);
  });

  it('часткове погашення — partial; звичайний переказ на картку теж зараховується', async () => {
    const { actor, debit, card, spend, repay } = await setup();
    await spend(1_000_000);
    expect((await repay({ amount: 20_000 })).body.month).toMatchObject({
      paid: 20_000,
      status: 'partial',
    });

    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: debit.id,
      toAccountId: card.accountId,
      amountMinor: 100_000,
      occurredAt: '2026-10-10T10:00:00Z',
    });
    expect((await details(actor, card.id)).month).toMatchObject({ paid: 120_000, status: 'paid' });
  });

  it('борг минулого місяця: залишок на початок місяця визначає потрібний платіж', async () => {
    const { actor, card, spend, repay } = await setup();
    await spend(80_000, '2026-09-20T10:00:00Z');
    // у вересні: борг 80 000, платити 80 000 до 25-го; у жовтні той самий залишок
    const september = (await actor.get(`/api/debts/${card.id}?month=2026-09`)).body;
    expect(september.month).toMatchObject({
      dueDate: '2026-09-25',
      required: 80_000,
      paid: 0,
      status: 'overdue',
    });
    expect((await details(actor, card.id)).month.required).toBe(80_000);

    await repay({ amount: 80_000 });
    expect(await details(actor, card.id)).toMatchObject({
      balance: 0,
      status: 'active',
      month: { paid: 80_000, status: 'paid' },
    });
  });

  it('переплата лишає власні кошти на картці: борг 0, доступно більше за ліміт', async () => {
    const { actor, card, spend, repay } = await setup();
    await spend(50_000);
    await repay({ amount: 70_000 });
    expect(await details(actor, card.id)).toMatchObject({
      balance: 0,
      status: 'active',
      card: { available: 5_020_000, usage: 0 },
    });
  });

  it('гасити картку з неї самої не можна — 422', async () => {
    const { card, repay } = await setup();
    const res = await repay({ amount: 100, fromAccountId: card.accountId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SAME_ACCOUNT');
  });

  it('рахунок-джерело: інша валюта — 422, чужий — 404', async () => {
    const { actor, repay } = await setup();
    const stranger = await createActor();
    const usd = await createAccount(actor, 'Долари', { currency: 'USD' });
    const foreign = await createAccount(stranger);

    const wrongCurrency = await repay({ amount: 100, fromAccountId: usd.id });
    expect(wrongCurrency.status).toBe(422);
    expect(wrongCurrency.body.error.code).toBe('CURRENCY_MISMATCH');
    expect((await repay({ amount: 100, fromAccountId: foreign.id })).status).toBe(404);
    expect((await actor.get('/api/transactions?type=transfer')).body.total).toBe(0);
  });

  it('заднім числом можна, на майбутню дату — 422', async () => {
    const { actor, card, spend, repay } = await setup();
    await spend(500_000, '2026-09-10T10:00:00Z');

    const past = await repay({ amount: 100_000, date: '2026-09-24' });
    expect(past.status).toBe(201);
    const september = (await actor.get(`/api/debts/${card.id}?month=2026-09`)).body;
    // сплачено менше мінімального платежу, а 25 вересня вже минуло
    expect(september.month).toMatchObject({ required: 120_000, paid: 100_000, status: 'overdue' });

    const future = await repay({ amount: 100, date: '2026-10-13' });
    expect(future.status).toBe(422);
    expect(future.body.error.code).toBe('EXPENSE_DATE_IN_FUTURE');
  });

  it('закрита кредитка не приймає погашень і покупок', async () => {
    const { actor, card, spend, repay } = await setup();
    await actor.post(`/api/debts/${card.id}/close`, {});
    expect((await repay({ amount: 100 })).status).toBe(400);
    expect((await spend(100)).status).toBe(400);
  });
});

describe('відсотки й комісії по кредитці', () => {
  it('записуються видатком з картки в системній категорії', async () => {
    const { actor, card } = await setup({ initialAmount: 100_000 });
    const res = await actor.post(`/api/debts/${card.id}/card-fees`, {
      amount: 3_100,
      date: TODAY,
      note: 'Відсотки за вересень',
    });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(103_100);

    const { body: expenses } = await actor.get('/api/transactions?type=expense');
    const { body: categories } = await actor.get('/api/categories');
    expect(categories.items).toEqual([
      expect.objectContaining({ name: 'Відсотки та комісії', systemKey: 'interest_fees' }),
    ]);
    expect(expenses.items).toEqual([
      expect.objectContaining({
        accountId: card.accountId,
        categoryId: categories.items[0].id,
        amountMinor: 3_100,
        description: 'Відсотки за вересень',
      }),
    ]);
  });

  it('без примітки опис — назва категорії; майбутня дата — 422', async () => {
    const { actor, card } = await setup();
    await actor.post(`/api/debts/${card.id}/card-fees`, { amount: 500, date: '2026-10-01' });
    const { body } = await actor.get('/api/transactions?type=expense');
    expect(body.items[0].description).toBe('Відсотки та комісії');

    const future = await actor.post(`/api/debts/${card.id}/card-fees`, {
      amount: 500,
      date: '2026-10-20',
    });
    expect(future.status).toBe(422);
  });
});

describe('звірка кредитки', () => {
  it('створює службову зміну балансу на різницю поточною датою', async () => {
    const { actor, card, spend } = await setup();
    await spend(100_000);

    const up = await actor.post(`/api/debts/${card.id}/adjustments`, { actualBalance: 104_500 });
    expect(up.status).toBe(201);
    expect(up.body.balance).toBe(104_500);
    expect(up.body.transactions[0]).toMatchObject({
      type: 'balance_adjustment',
      amountMinor: -4_500,
      description: 'Звірка залишку',
      occurredAt: new Date(NOW).toISOString(),
    });

    const down = await actor.post(`/api/debts/${card.id}/adjustments`, {
      actualBalance: 90_000,
      note: 'Кешбек',
    });
    expect(down.body.balance).toBe(90_000);
    expect(down.body.transactions[0]).toMatchObject({ amountMinor: 14_500, description: 'Кешбек' });
    expect(await balanceOfAccount(actor, card.accountId)).toBe(-90_000);
  });

  it('збіг нічого не записує; власні кошти на картці обнуляються звіркою боргу', async () => {
    const { actor, card, repay } = await setup();
    const same = await actor.post(`/api/debts/${card.id}/adjustments`, { actualBalance: 0 });
    expect(same.body.transactions).toEqual([]);

    await repay({ amount: 5_000 }); // на картці 5 000 власних коштів
    const res = await actor.post(`/api/debts/${card.id}/adjustments`, { actualBalance: 1_000 });
    expect(res.body.balance).toBe(1_000);
    expect(await balanceOfAccount(actor, card.accountId)).toBe(-1_000);
  });
});

describe('дії кредитки лише для кредиток і лише свої', () => {
  it('погашення переказом і відсотки для позики — 422', async () => {
    const actor = await createActor();
    const debit = await createAccount(actor);
    const { body: loan } = await actor.post('/api/debts', loanInput());

    const payment = await actor.post(`/api/debts/${loan.id}/card-payments`, {
      fromAccountId: debit.id,
      amount: 100,
      date: TODAY,
    });
    const fee = await actor.post(`/api/debts/${loan.id}/card-fees`, { amount: 100, date: TODAY });
    for (const res of [payment, fee]) {
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DEBT_TYPE_MISMATCH');
    }
    expect((await actor.get('/api/transactions')).body.total).toBe(0);
  });

  it('чужа кредитка — 404', async () => {
    const { card } = await setup();
    const stranger = await createActor();
    const own = await createAccount(stranger);
    const payment = await stranger.post(`/api/debts/${card.id}/card-payments`, {
      fromAccountId: own.id,
      amount: 100,
      date: TODAY,
    });
    const fee = await stranger.post(`/api/debts/${card.id}/card-fees`, {
      amount: 100,
      date: TODAY,
    });
    expect([payment.status, fee.status]).toEqual([404, 404]);
  });

  it('некоректні дані — 400', async () => {
    const { actor, card, repay } = await setup();
    expect((await repay({ amount: 0 })).status).toBe(400);
    expect((await repay({ amount: 100, date: 'вчора' })).status).toBe(400);
    const fee = await actor.post(`/api/debts/${card.id}/card-fees`, { amount: -5, date: TODAY });
    expect(fee.status).toBe(400);
  });
});
