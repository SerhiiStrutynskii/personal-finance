import { sql } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp } from '../../../test/harness.ts';
import { MISSING_ID, NOW, TODAY, cardInput, createAccount, loanInput } from './helpers.ts';

const { app, db, createActor, setNow } = setupTestApp();
beforeEach(() => setNow(NOW));

const count = async (table: 'accounts' | 'debts' | 'transactions') => {
  const result = await db.execute<{ total: string }>(
    sql`SELECT count(*) AS total FROM ${sql.identifier(table)}`,
  );
  return Number(result.rows[0]!.total);
};

describe('створення боргу', () => {
  it('створює позику з умовами й розрахунками', async () => {
    const actor = await createActor();
    const res = await actor.post('/api/debts', loanInput({ description: '  На ремонт ' }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Позика банку',
      description: 'На ремонт',
      type: 'bank_loan',
      status: 'active',
      accountId: null,
      currency: 'UAH',
      initialAmount: 1_000_000,
      startDate: '2026-01-15',
      maturityDate: '2027-01-15',
      interestRate: 24,
      ratePeriod: 'year',
      monthlyPayment: 100_000,
      paymentDay: 20,
      earlyRepaymentAllowed: true,
      defaultAccountId: null,
      balance: 1_000_000,
      card: null,
      month: { dueDate: '2026-10-20', required: 100_000, paid: 0, status: 'pending' },
    });
    expect(res.body).not.toHaveProperty('householdId');
    // 24% річних = 2% на місяць; позика не створює рахунків і транзакцій
    expect(res.body.projection).toMatchObject({
      paymentCoversInterest: true,
      assumesNoNewPurchases: false,
    });
    expect(await count('accounts')).toBe(0);
    expect(await count('transactions')).toBe(0);
  });

  it('кредитка атомарно створює рахунок-картку, борг і початковий баланс', async () => {
    const actor = await createActor();
    const res = await actor.post('/api/debts', cardInput({ initialAmount: 2_340_000 }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'credit_card',
      balance: 2_340_000,
      maturityDate: null,
      earlyRepaymentAllowed: true,
      card: {
        creditLimit: 5_000_000,
        available: 2_660_000,
        usage: 0.468,
        overLimitBy: 0,
        nearLimit: false,
      },
      projection: { assumesNoNewPurchases: true },
    });

    const { body: account } = await actor.get(`/api/accounts/${res.body.accountId}`);
    expect(account).toMatchObject({
      name: 'Кредитка',
      type: 'credit_card',
      currency: 'UAH',
      creditLimit: 5_000_000,
      balance: -2_340_000,
      isArchived: false,
    });

    const { body: history } = await actor.get('/api/transactions');
    expect(history.items).toEqual([
      expect.objectContaining({
        type: 'balance_adjustment',
        accountId: account.id,
        amountMinor: -2_340_000,
        // початок 1 вересня за Києвом
        occurredAt: '2026-08-31T21:00:00.000Z',
      }),
    ]);
  });

  it('кредитка без початкового боргу не створює транзакцій', async () => {
    const actor = await createActor();
    const res = await actor.post('/api/debts', cardInput());
    expect(res.body).toMatchObject({ balance: 0, month: { required: 0, status: 'none' } });
    expect(await count('transactions')).toBe(0);
  });

  it('помилка під час створення кредитки відкочує рахунок, борг і баланс', async () => {
    const actor = await createActor();
    const res = await actor.post(
      '/api/debts',
      cardInput({ initialAmount: 100_000, defaultAccountId: MISSING_ID }),
    );

    expect(res.status).toBe(404);
    expect(await count('accounts')).toBe(0);
    expect(await count('debts')).toBe(0);
    expect(await count('transactions')).toBe(0);
  });

  it('прив’язує наявний рахунок: він стає кредитною карткою, борг — його від’ємний баланс', async () => {
    const actor = await createActor();
    const account = await createAccount(actor, 'Стара картка');
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: account.id,
      amountMinor: 70_000,
      occurredAt: '2026-10-05T10:00:00Z',
    });

    const res = await actor.post('/api/debts', cardInput({ existingAccountId: account.id }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ accountId: account.id, balance: 70_000 });
    expect((await actor.get(`/api/accounts/${account.id}`)).body).toMatchObject({
      name: 'Стара картка',
      type: 'credit_card',
      creditLimit: 5_000_000,
    });
    expect(await count('accounts')).toBe(1);
    expect(await count('transactions')).toBe(1);

    // той самий рахунок удруге прив'язати не можна
    const again = await actor.post('/api/debts', cardInput({ existingAccountId: account.id }));
    expect(again.status).toBe(409);
  });

  it('прив’язка наявного рахунку вимагає нульової початкової суми й валюти UAH', async () => {
    const actor = await createActor();
    const account = await createAccount(actor);
    const usd = await createAccount(actor, 'Долари', { currency: 'USD' });

    const withAmount = await actor.post(
      '/api/debts',
      cardInput({ existingAccountId: account.id, initialAmount: 100 }),
    );
    expect(withAmount.status).toBe(400);

    const foreign = await actor.post('/api/debts', cardInput({ existingAccountId: usd.id }));
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('CURRENCY_MISMATCH');
    expect(await count('debts')).toBe(0);
  });

  it.each([
    ['bank_loan без maturityDate', loanInput({ maturityDate: undefined })],
    ['installment без maturityDate', loanInput({ type: 'installment', maturityDate: null })],
    ['строк не пізніше за початок', loanInput({ maturityDate: '2026-01-15' })],
    ['credit_card без creditLimit', cardInput({ creditLimit: undefined })],
    ['позика з кредитним лімітом', loanInput({ creditLimit: 100_000 })],
    ['позика з existingAccountId', loanInput({ existingAccountId: MISSING_ID })],
    ['від’ємна початкова сума', loanInput({ initialAmount: -1 })],
    ['дробова сума', loanInput({ initialAmount: 10.5 })],
    ['нульовий платіж', loanInput({ monthlyPayment: 0 })],
    ['день платежу 32', loanInput({ paymentDay: 32 })],
    ['від’ємна ставка', loanInput({ interestRate: -1 })],
    ['ставка з п’ятьма знаками', loanInput({ interestRate: 1.23456 })],
    ['невідомий тип', loanInput({ type: 'mortgage' })],
    ['невідомий період ставки', loanInput({ ratePeriod: 'week' })],
    ['інша валюта', loanInput({ currency: 'USD' })],
    ['порожня назва', loanInput({ name: ' ' })],
    ['некоректна дата', loanInput({ startDate: '2026-02-30' })],
  ])('відхиляє некоректні дані: %s', async (_name, body) => {
    const actor = await createActor();
    const res = await actor.post('/api/debts', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await count('debts')).toBe(0);
  });

  it('дата початку може бути в минулому, але не в майбутньому', async () => {
    const actor = await createActor();
    expect((await actor.post('/api/debts', loanInput({ startDate: '2020-05-01' }))).status).toBe(
      201,
    );
    expect((await actor.post('/api/debts', loanInput({ startDate: TODAY }))).status).toBe(201);
    const future = await actor.post(
      '/api/debts',
      loanInput({ startDate: '2026-10-13', maturityDate: '2027-10-13' }),
    );
    expect(future.status).toBe(400);
  });

  it('рахунок для погашення має бути своїм і в гривні', async () => {
    const actor = await createActor();
    const stranger = await createActor();
    const own = await createAccount(actor);
    const usd = await createAccount(actor, 'Долари', { currency: 'USD' });
    const foreign = await createAccount(stranger);

    const ok = await actor.post('/api/debts', loanInput({ defaultAccountId: own.id }));
    expect(ok.body.defaultAccountId).toBe(own.id);

    const wrongCurrency = await actor.post('/api/debts', loanInput({ defaultAccountId: usd.id }));
    expect(wrongCurrency.status).toBe(422);
    expect(wrongCurrency.body.error.code).toBe('CURRENCY_MISMATCH');

    const notMine = await actor.post('/api/debts', loanInput({ defaultAccountId: foreign.id }));
    expect(notMine.status).toBe(404);
  });

  it('для кредитки дострокове погашення завжди дозволене', async () => {
    const actor = await createActor();
    const res = await actor.post('/api/debts', cardInput({ earlyRepaymentAllowed: false }));
    expect(res.body.earlyRepaymentAllowed).toBe(true);
  });
});

describe('огляд боргів', () => {
  it('порожній огляд', async () => {
    const actor = await createActor();
    const { body } = await actor.get('/api/debts');
    expect(body).toEqual({
      month: '2026-10',
      currency: 'UAH',
      today: TODAY,
      summary: {
        totalBalance: 0,
        totalMonthlyPayments: 0,
        weightedAnnualRate: null,
        dueThisMonth: 0,
        debtFreeDate: null,
        totalCreditAvailable: 0,
      },
      debts: [],
    });
  });

  it('підсумки й список за датою найближчого платежу', async () => {
    const actor = await createActor();
    await actor.post('/api/debts', cardInput({ initialAmount: 2_000_000 }));
    await actor.post('/api/debts', loanInput());
    await actor.post(
      '/api/debts',
      loanInput({
        name: 'Розстрочка',
        type: 'installment',
        initialAmount: 300_000,
        interestRate: 0,
        monthlyPayment: 100_000,
        paymentDay: 14,
      }),
    );

    const { body } = await actor.get('/api/debts?month=2026-10');
    expect(body.debts.map((debt: { name: string }) => debt.name)).toEqual([
      'Розстрочка',
      'Позика банку',
      'Кредитка',
    ]);
    expect(body.debts.map((debt: { month: { status: string } }) => debt.month.status)).toEqual([
      'due_soon', // 14-те, сьогодні 12-те
      'pending', // 20-те
      'pending', // 25-те
    ]);
    expect(body.summary).toMatchObject({
      totalBalance: 3_300_000,
      totalMonthlyPayments: 320_000,
      dueThisMonth: 320_000,
      totalCreditAvailable: 3_000_000,
    });
    // (2 000 000·37,2 + 1 000 000·24 + 300 000·0) / 3 300 000
    expect(body.summary.weightedAnnualRate).toBe(29.82);
    expect(body.summary.debtFreeDate).toBe(
      body.debts
        .map((debt: { projection: { payoffDate: string } }) => debt.projection.payoffDate)
        .sort()
        .at(-1),
    );
  });

  it('прогноз: розстрочка без відсотків і попередження про строк', async () => {
    const actor = await createActor();
    const { body } = await actor.post(
      '/api/debts',
      loanInput({
        type: 'installment',
        interestRate: 0,
        initialAmount: 1_200_000,
        monthlyPayment: 270_000,
        paymentDay: 10,
        startDate: '2026-10-11',
        maturityDate: '2027-02-10',
      }),
    );
    // почалась після 10 жовтня — перший платіж 10 листопада
    expect(body.month).toMatchObject({ dueDate: '2026-10-10', required: 0, status: 'none' });
    expect(body.projection).toEqual({
      months: 5,
      payoffDate: '2027-03-10',
      totalInterest: 0,
      paymentCoversInterest: true,
      maturityWarning: { requiredPayment: 300_000 },
      assumesNoNewPurchases: false,
    });
  });

  it('платіж, що не покриває відсотки', async () => {
    const actor = await createActor();
    const { body } = await actor.post(
      '/api/debts',
      loanInput({ interestRate: 1, ratePeriod: 'day', monthlyPayment: 100_000 }),
    );
    expect(body.projection).toMatchObject({
      months: null,
      payoffDate: null,
      totalInterest: null,
      paymentCoversInterest: false,
    });
    expect(body.projection.maturityWarning.requiredPayment).toBeGreaterThan(100_000);
    expect((await actor.get('/api/debts')).body.summary.debtFreeDate).toBeNull();
  });

  it('місяць до початку боргу й некоректний місяць', async () => {
    const actor = await createActor();
    await actor.post('/api/debts', loanInput());
    const { body } = await actor.get('/api/debts?month=2025-12');
    expect(body.debts[0].month).toMatchObject({ required: 0, status: 'none' });
    expect((await actor.get('/api/debts?month=2026-13')).status).toBe(400);
  });
});

describe('деталі, зміна, закриття й видалення', () => {
  it('деталі позики й кредитки', async () => {
    const actor = await createActor();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: card } = await actor.post('/api/debts', cardInput({ initialAmount: 50_000 }));

    const loanDetails = (await actor.get(`/api/debts/${loan.id}`)).body;
    expect(loanDetails).toMatchObject({
      id: loan.id,
      viewedMonth: '2026-10',
      today: TODAY,
      entries: [],
      transactions: [],
    });

    const cardDetails = (await actor.get(`/api/debts/${card.id}`)).body;
    expect(cardDetails.entries).toEqual([]);
    expect(cardDetails.transactions).toEqual([
      expect.objectContaining({ type: 'balance_adjustment', amountMinor: -50_000 }),
    ]);
  });

  it('змінює умови, не чіпаючи суму й дату початку', async () => {
    const actor = await createActor();
    const { body: loan } = await actor.post('/api/debts', loanInput());

    const res = await actor.patch(`/api/debts/${loan.id}`, {
      name: 'Нова назва',
      monthlyPayment: 150_000,
      paymentDay: 5,
      interestRate: 12.5,
      earlyRepaymentAllowed: false,
      initialAmount: 1,
      startDate: '2020-01-01',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Нова назва',
      monthlyPayment: 150_000,
      paymentDay: 5,
      interestRate: 12.5,
      earlyRepaymentAllowed: false,
      initialAmount: 1_000_000,
      startDate: '2026-01-15',
      // 5 жовтня вже минуло
      month: { dueDate: '2026-10-05', status: 'overdue' },
    });
  });

  it('перевіряє узгодженість зміни з типом боргу', async () => {
    const actor = await createActor();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: card } = await actor.post('/api/debts', cardInput());
    const patch = (id: string, body: object) => actor.patch(`/api/debts/${id}`, body);

    expect((await patch(loan.id, {})).status).toBe(400);
    expect((await patch(loan.id, { maturityDate: null })).status).toBe(400);
    expect((await patch(loan.id, { maturityDate: '2026-01-15' })).status).toBe(400);
    expect((await patch(loan.id, { creditLimit: 100_000 })).status).toBe(400);
    expect((await patch(card.id, { earlyRepaymentAllowed: false })).status).toBe(400);
    expect((await patch(card.id, { creditLimit: null })).status).toBe(400);
    expect((await patch(card.id, { defaultAccountId: card.accountId })).status).toBe(400);

    const limit = await patch(card.id, { creditLimit: 8_000_000, maturityDate: '2028-01-01' });
    expect(limit.body).toMatchObject({
      maturityDate: '2028-01-01',
      card: { creditLimit: 8_000_000, available: 8_000_000 },
    });
  });

  it('кредитка закривається лише з нульовим боргом і архівує рахунок', async () => {
    const actor = await createActor();
    const { body: owing } = await actor.post('/api/debts', cardInput({ initialAmount: 100 }));
    expect((await actor.post(`/api/debts/${owing.id}/close`, {})).status).toBe(409);

    const { body: clear } = await actor.post('/api/debts', cardInput({ name: 'Друга' }));
    const closed = await actor.post(`/api/debts/${clear.id}/close`, {});
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    expect((await actor.get(`/api/accounts/${clear.accountId}`)).body.isArchived).toBe(true);

    // закриті — в кінці списку й поза підсумком
    const { body } = await actor.get('/api/debts');
    expect(body.debts.at(-1).id).toBe(clear.id);
    expect(body.summary.totalCreditAvailable).toBe(4_999_900);
  });

  it('позику з залишком закрити не можна', async () => {
    const actor = await createActor();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    expect((await actor.post(`/api/debts/${loan.id}/close`, {})).status).toBe(409);
  });

  it('борг без рухів видаляється; кредитка — разом із рахунком і початковим балансом', async () => {
    const actor = await createActor();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: card } = await actor.post('/api/debts', cardInput({ initialAmount: 50_000 }));

    expect((await actor.delete(`/api/debts/${loan.id}`)).status).toBe(204);
    expect((await actor.delete(`/api/debts/${card.id}`)).status).toBe(204);
    expect(await count('debts')).toBe(0);
    expect(await count('accounts')).toBe(0);
    expect(await count('transactions')).toBe(0);
  });

  it('видалення кредитки з рухами лишає рахунок звичайною карткою з усіма транзакціями', async () => {
    const actor = await createActor();
    const debit = await createAccount(actor);
    const { body: card } = await actor.post('/api/debts', cardInput({ initialAmount: 50_000 }));
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.accountId,
      amountMinor: 100,
      occurredAt: '2026-10-05T10:00:00Z',
    });
    await actor.post(`/api/debts/${card.id}/card-payments`, {
      fromAccountId: debit.id,
      amount: 20_000,
      date: TODAY,
    });

    expect((await actor.delete(`/api/debts/${card.id}`)).status).toBe(204);
    expect(await count('debts')).toBe(0);
    // рахунок, покупка, переказ і початковий баланс на місці
    expect(await count('transactions')).toBe(3);
    expect((await actor.get(`/api/accounts/${card.accountId}`)).body).toMatchObject({
      name: 'Кредитка',
      type: 'card',
      creditLimit: null,
      balance: -30_100,
      isArchived: false,
    });

    // тепер це звичайний рахунок: його можна знову прив'язати до нового боргу
    const again = await actor.post('/api/debts', cardInput({ existingAccountId: card.accountId }));
    expect(again.status).toBe(201);
    expect(again.body.balance).toBe(30_100);
  });

  it('рахунок-картку не можна видалити окремо від боргу', async () => {
    const actor = await createActor();
    const { body: card } = await actor.post('/api/debts', cardInput());
    const res = await actor.delete(`/api/accounts/${card.accountId}`);
    expect(res.status).toBe(409);
    expect((await actor.get(`/api/debts/${card.id}`)).status).toBe(200);
  });
});

describe('ізоляція домогосподарств і доступ', () => {
  it('чужі борги не видно й не можна змінити', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const { body: loan } = await owner.post('/api/debts', loanInput());

    expect((await stranger.get('/api/debts')).body.debts).toEqual([]);
    expect((await stranger.get(`/api/debts/${loan.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/debts/${loan.id}`, { name: 'x' })).status).toBe(404);
    expect((await stranger.post(`/api/debts/${loan.id}/close`, {})).status).toBe(404);
    expect((await stranger.delete(`/api/debts/${loan.id}`)).status).toBe(404);
    expect((await owner.get(`/api/debts/${loan.id}`)).body.name).toBe('Позика банку');
  });

  it('чужий рахунок не прив’язується до кредитки', async () => {
    const owner = await createActor();
    const stranger = await createActor();
    const account = await createAccount(owner);
    const res = await stranger.post('/api/debts', cardInput({ existingAccountId: account.id }));
    expect(res.status).toBe(404);
    expect((await owner.get(`/api/accounts/${account.id}`)).body.type).toBe('card');
  });

  it('без токена — 401', async () => {
    expect((await request(app).get('/api/debts')).status).toBe(401);
  });
});
