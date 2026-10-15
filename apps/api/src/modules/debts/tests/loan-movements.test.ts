import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';
import {
  MISSING_ID,
  NOW,
  TODAY,
  balanceOfAccount,
  cardInput,
  createAccount,
  fund,
  loanInput,
} from './helpers.ts';

const { db, createActor, setNow } = setupTestApp();
beforeEach(() => setNow(NOW));

/** Позика 10 000 грн під 24% річних (2% на місяць), платіж 1 000 грн 20-го числа. */
async function setup(override: object = {}) {
  const actor = await createActor();
  const account = await createAccount(actor);
  await fund(actor, account.id, 2_000_000);
  const { body: loan } = await actor.post('/api/debts', loanInput(override));
  const pay = (body: object) =>
    actor.post(`/api/debts/${loan.id}/payments`, { accountId: account.id, date: TODAY, ...body });
  return { actor, account, loan: loan as { id: string }, pay };
}

const details = async (actor: Actor, id: string) => (await actor.get(`/api/debts/${id}`)).body;

describe('платіж по позиці', () => {
  it('створює транзакцію рахунку й запис боргу з пропонованою розбивкою', async () => {
    const { actor, account, loan, pay } = await setup();
    const res = await pay({ amount: 100_000 });

    expect(res.status).toBe(201);
    // відсотки за місяць: 2% від 1 000 000 = 20 000
    expect(res.body).toMatchObject({
      balance: 920_000,
      status: 'active',
      month: { required: 100_000, paid: 100_000, status: 'paid' },
    });
    expect(res.body.entries).toEqual([
      expect.objectContaining({
        kind: 'payment',
        amount: 100_000,
        principalPart: 80_000,
        interestPart: 20_000,
        accountId: account.id,
        date: TODAY,
      }),
    ]);

    const { body: list } = await actor.get('/api/transactions?type=debt_payment');
    expect(list.items).toEqual([
      expect.objectContaining({
        type: 'debt_payment',
        accountId: account.id,
        debtId: loan.id,
        amountMinor: 100_000,
        description: 'Позика банку',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ]);
    expect(await balanceOfAccount(actor, account.id)).toBe(1_900_000);

    // транзакція має системну категорію «Погашення боргів»
    const { body: categories } = await actor.get('/api/categories');
    expect(categories.items).toEqual([
      expect.objectContaining({ id: list.items[0].categoryId, systemKey: 'debt_repayment' }),
    ]);
  });

  it('приймає розбивку з виписки банку', async () => {
    const { pay } = await setup();
    const res = await pay({ amount: 100_000, principalPart: 70_000, interestPart: 30_000 });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(930_000);
    expect(res.body.entries[0]).toMatchObject({ principalPart: 70_000, interestPart: 30_000 });
  });

  it.each([
    ['частини не дорівнюють сумі', { amount: 100_000, principalPart: 70_000, interestPart: 1 }],
    ['лише одна частина', { amount: 100_000, principalPart: 100_000 }],
    ['нульова сума', { amount: 0 }],
    ['некоректна дата', { amount: 100, date: '2026-13-01' }],
    ['без рахунку', { amount: 100, accountId: undefined }],
  ])('відхиляє некоректний платіж: %s', async (_name, body) => {
    const { pay } = await setup();
    const res = await pay(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ставка 0 — уся сума йде в тіло', async () => {
    const { pay } = await setup({ type: 'installment', interestRate: 0 });
    const res = await pay({ amount: 100_000 });
    expect(res.body.entries[0]).toMatchObject({ principalPart: 100_000, interestPart: 0 });
  });

  it('часткова оплата — статус partial', async () => {
    const { pay } = await setup();
    const res = await pay({ amount: 40_000 });
    expect(res.body.month).toMatchObject({ paid: 40_000, status: 'partial' });
  });

  it('недостатньо коштів на рахунку платіж не блокує', async () => {
    const actor = await createActor();
    const empty = await createAccount(actor);
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const res = await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: empty.id,
      amount: 100_000,
      date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(await balanceOfAccount(actor, empty.id)).toBe(-100_000);
  });

  it('помилка відкочує і транзакцію, і запис', async () => {
    const { actor, account, loan, pay } = await setup();
    // тимчасове обмеження змушує базу відхилити запис боргу вже після вставки транзакції
    await db.execute(sql`
      ALTER TABLE debt_entries ADD CONSTRAINT test_reject CHECK (kind <> 'payment') NOT VALID
    `);
    try {
      const res = await pay({ amount: 100_000 });
      expect(res.status).toBe(500);
    } finally {
      await db.execute(sql`ALTER TABLE debt_entries DROP CONSTRAINT test_reject`);
    }
    expect((await actor.get('/api/transactions?type=debt_payment')).body.total).toBe(0);
    expect(await balanceOfAccount(actor, account.id)).toBe(2_000_000);
    expect((await details(actor, loan.id)).entries).toEqual([]);
  });

  it('видалення платежу видаляє транзакцію й відновлює баланс рахунку та борг', async () => {
    const { actor, account, loan, pay } = await setup();
    const { body } = await pay({ amount: 100_000 });
    const entryId = body.entries[0].id;

    expect((await actor.delete(`/api/debts/${loan.id}/entries/${entryId}`)).status).toBe(204);
    expect(await balanceOfAccount(actor, account.id)).toBe(2_000_000);
    expect((await actor.get('/api/transactions?type=debt_payment')).body.total).toBe(0);
    expect(await details(actor, loan.id)).toMatchObject({
      balance: 1_000_000,
      entries: [],
      month: { paid: 0, status: 'pending' },
    });
    expect((await actor.delete(`/api/debts/${loan.id}/entries/${entryId}`)).status).toBe(404);
  });

  it('платіж можна внести заднім числом, але не на майбутню дату', async () => {
    const { pay } = await setup();
    const past = await pay({ amount: 100_000, date: '2026-09-18' });
    expect(past.status).toBe(201);
    // платіж вересня не зараховується в жовтень
    expect(past.body.month).toMatchObject({ paid: 0, status: 'pending' });
    expect(past.body.entries[0].date).toBe('2026-09-18');

    const future = await pay({ amount: 100_000, date: '2026-10-13' });
    expect(future.status).toBe(422);
    expect(future.body.error.code).toBe('EXPENSE_DATE_IN_FUTURE');

    const beforeStart = await pay({ amount: 100_000, date: '2026-01-14' });
    expect(beforeStart.status).toBe(400);
  });

  it('статус місяця рахується за місяцем платежу', async () => {
    const { actor, loan, pay } = await setup();
    await pay({ amount: 100_000, date: '2026-09-18' });
    const september = (await actor.get(`/api/debts/${loan.id}?month=2026-09`)).body;
    expect(september.month).toEqual({
      dueDate: '2026-09-20',
      required: 100_000,
      paid: 100_000,
      status: 'paid',
    });
    // на початок жовтня борг уже менший
    expect((await details(actor, loan.id)).balance).toBe(920_000);
  });

  it('рахунок іншої валюти — 422, чужий або невідомий — 404, архівний — 400', async () => {
    const { actor, account, loan, pay } = await setup();
    const stranger = await createActor();
    const usd = await createAccount(actor, 'Долари', { currency: 'USD' });
    const foreign = await createAccount(stranger);

    const wrongCurrency = await pay({ amount: 100, accountId: usd.id });
    expect(wrongCurrency.status).toBe(422);
    expect(wrongCurrency.body.error.code).toBe('CURRENCY_MISMATCH');
    expect((await pay({ amount: 100, accountId: foreign.id })).status).toBe(404);
    expect((await pay({ amount: 100, accountId: MISSING_ID })).status).toBe(404);

    await db.execute(sql`UPDATE accounts SET is_archived = true WHERE id = ${account.id}`);
    expect((await pay({ amount: 100 })).status).toBe(400);
    expect((await details(actor, loan.id)).entries).toEqual([]);
  });

  it('тіло платежу не може перевищувати залишок', async () => {
    const { pay } = await setup({ initialAmount: 50_000, interestRate: 0 });
    expect((await pay({ amount: 50_001 })).status).toBe(400);
    expect(
      (await pay({ amount: 60_000, principalPart: 50_000, interestPart: 10_000 })).status,
    ).toBe(201);
  });
});

describe('дострокове погашення', () => {
  it('дозволене — без обмежень', async () => {
    const { pay } = await setup();
    const res = await pay({ amount: 300_000 });
    expect(res.status).toBe(201);
    expect(res.body.month.status).toBe('paid');
  });

  it('заборонене — 422 без confirmEarly, з підтвердженням проходить', async () => {
    const { actor, loan, pay } = await setup({ earlyRepaymentAllowed: false });

    // рівно потрібна сума — не дострокове
    expect((await pay({ amount: 100_000 })).status).toBe(201);

    const early = await pay({ amount: 1 });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('EARLY_REPAYMENT_NOT_ALLOWED');
    expect((await details(actor, loan.id)).entries).toHaveLength(1);

    const confirmed = await pay({ amount: 50_000, confirmEarly: true });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.entries).toHaveLength(2);
  });

  it('одним платежем більше потрібного — теж дострокове', async () => {
    const { pay } = await setup({ earlyRepaymentAllowed: false });
    expect((await pay({ amount: 100_001 })).status).toBe(422);
  });
});

describe('нарахування й статус боргу', () => {
  it('нарахування збільшує борг і не чіпає рахунки', async () => {
    const { actor, account, loan } = await setup();
    const res = await actor.post(`/api/debts/${loan.id}/charges`, {
      amount: 25_000,
      date: TODAY,
      note: ' Штраф ',
    });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(1_025_000);
    expect(res.body.entries[0]).toMatchObject({
      kind: 'charge',
      amount: 25_000,
      principalPart: null,
      accountId: null,
      note: 'Штраф',
    });
    expect(await balanceOfAccount(actor, account.id)).toBe(2_000_000);
    expect((await actor.get('/api/transactions?type=debt_payment')).body.total).toBe(0);
  });

  it('нарахування на майбутню дату — 422', async () => {
    const { actor, loan } = await setup();
    const res = await actor.post(`/api/debts/${loan.id}/charges`, {
      amount: 100,
      date: '2026-11-01',
    });
    expect(res.status).toBe(422);
  });

  it('залишок 0 закриває позику, нове нарахування відкриває знову', async () => {
    const { actor, loan, pay } = await setup({ initialAmount: 50_000, interestRate: 0 });

    const paid = await pay({ amount: 50_000 });
    expect(paid.body).toMatchObject({ balance: 0, status: 'closed' });
    // погашений борг більше не приймає платежів
    expect((await pay({ amount: 100 })).status).toBe(409);

    const charged = await actor.post(`/api/debts/${loan.id}/charges`, { amount: 700, date: TODAY });
    expect(charged.body).toMatchObject({ balance: 700, status: 'active' });

    // видалення нарахування знову закриває, видалення платежу — відкриває
    const chargeId = charged.body.entries.find(
      (entry: { kind: string }) => entry.kind === 'charge',
    ).id;
    await actor.delete(`/api/debts/${loan.id}/entries/${chargeId}`);
    expect((await details(actor, loan.id)).status).toBe('closed');
    const paymentId = paid.body.entries[0].id;
    await actor.delete(`/api/debts/${loan.id}/entries/${paymentId}`);
    expect(await details(actor, loan.id)).toMatchObject({ balance: 50_000, status: 'active' });
  });

  it('потрібний платіж місяця не перевищує залишок із нарахуваннями', async () => {
    const { actor, loan } = await setup({ initialAmount: 30_000, interestRate: 0 });
    expect((await details(actor, loan.id)).month.required).toBe(30_000);
    await actor.post(`/api/debts/${loan.id}/charges`, { amount: 5_000, date: TODAY });
    expect((await details(actor, loan.id)).month.required).toBe(35_000);
  });
});

describe('звірка позики', () => {
  it('зберігає різницю з фактичним залишком поточною датою', async () => {
    const { actor, loan } = await setup();
    const down = await actor.post(`/api/debts/${loan.id}/adjustments`, {
      actualBalance: 985_000,
      note: 'За випискою',
    });
    expect(down.status).toBe(201);
    expect(down.body.balance).toBe(985_000);
    expect(down.body.entries[0]).toMatchObject({
      kind: 'adjustment',
      amount: -15_000,
      date: TODAY,
      note: 'За випискою',
    });

    const up = await actor.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: 990_000 });
    expect(up.body.balance).toBe(990_000);
    expect(up.body.entries).toHaveLength(2);
    expect(
      (await actor.get('/api/transactions')).body.items.every(
        (item: { type: string }) => item.type === 'income',
      ),
    ).toBe(true);
  });

  it('збіг із обліковим залишком нічого не записує', async () => {
    const { actor, loan } = await setup();
    const res = await actor.post(`/api/debts/${loan.id}/adjustments`, {
      actualBalance: 1_000_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.entries).toEqual([]);
  });

  it('звірка до нуля закриває позику', async () => {
    const { actor, loan } = await setup();
    const res = await actor.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: 0 });
    expect(res.body).toMatchObject({ balance: 0, status: 'closed' });
  });

  it('від’ємний залишок — помилка валідації', async () => {
    const { actor, loan } = await setup();
    const res = await actor.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: -1 });
    expect(res.status).toBe(400);
  });
});

describe('попередній перегляд платежу', () => {
  it('розбивка, ознака дострокового й прогноз після платежу', async () => {
    const { actor, loan } = await setup();
    const { body } = await actor.get(`/api/debts/${loan.id}/payment-preview?amount=100000`);
    expect(body).toMatchObject({
      amount: 100_000,
      principalPart: 80_000,
      interestPart: 20_000,
      isEarly: false,
      requiresConfirmation: false,
      balanceAfter: 920_000,
    });
    // звичайний платіж нічого не заощаджує: це перший крок того самого прогнозу
    expect(body.interestSaved).toBe(0);
    expect((await actor.get(`/api/debts/${loan.id}`)).body.entries).toEqual([]);
  });

  it('достроковий платіж заощаджує відсотки й скорочує строк', async () => {
    const { actor, loan } = await setup();
    const before = (await details(actor, loan.id)).projection;
    const { body } = await actor.get(`/api/debts/${loan.id}/payment-preview?amount=500000`);
    expect(body.isEarly).toBe(true);
    expect(body.interestSaved).toBeGreaterThan(0);
    expect(body.projection.months).toBeLessThan(before.months);
  });

  it('заборонене дострокове погашення потребує підтвердження', async () => {
    const { actor, loan } = await setup({ earlyRepaymentAllowed: false });
    const { body } = await actor.get(`/api/debts/${loan.id}/payment-preview?amount=100001`);
    expect(body).toMatchObject({ isEarly: true, requiresConfirmation: true });
  });

  it('некоректна сума — 400', async () => {
    const { actor, loan } = await setup();
    for (const amount of ['0', '-5', 'abc', '10.5']) {
      const res = await actor.get(`/api/debts/${loan.id}/payment-preview?amount=${amount}`);
      expect(res.status).toBe(400);
    }
  });
});

describe('записи боргу лише для позик і лише свої', () => {
  it('платіж, нарахування, перегляд і видалення запису для кредитки — 422', async () => {
    const actor = await createActor();
    const account = await createAccount(actor);
    const { body: card } = await actor.post('/api/debts', cardInput({ initialAmount: 100_000 }));

    const responses = await Promise.all([
      actor.post(`/api/debts/${card.id}/payments`, {
        accountId: account.id,
        amount: 100,
        date: TODAY,
      }),
      actor.post(`/api/debts/${card.id}/charges`, { amount: 100, date: TODAY }),
      actor.get(`/api/debts/${card.id}/payment-preview?amount=100`),
      actor.delete(`/api/debts/${card.id}/entries/${MISSING_ID}`),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DEBT_TYPE_MISMATCH');
    }
    const stored = await db.execute(sql`SELECT 1 FROM debt_entries`);
    expect(stored.rows).toEqual([]);
  });

  it('чужий борг — 404 для всіх рухів', async () => {
    const { loan, pay } = await setup();
    const { body: paid } = await pay({ amount: 100_000 });
    const stranger = await createActor();
    const own = await createAccount(stranger);

    const responses = await Promise.all([
      stranger.post(`/api/debts/${loan.id}/payments`, {
        accountId: own.id,
        amount: 100,
        date: TODAY,
      }),
      stranger.post(`/api/debts/${loan.id}/charges`, { amount: 100, date: TODAY }),
      stranger.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: 0 }),
      stranger.get(`/api/debts/${loan.id}/payment-preview?amount=100`),
      stranger.delete(`/api/debts/${loan.id}/entries/${paid.entries[0].id}`),
    ]);
    expect(responses.map((res) => res.status)).toEqual([404, 404, 404, 404, 404]);
  });

  it('видалення позики з рухами прибирає записи й платежі та відновлює баланс рахунку', async () => {
    const { actor, account, loan, pay } = await setup();
    await pay({ amount: 100_000 });
    await pay({ amount: 50_000, date: '2026-09-18' });
    await actor.post(`/api/debts/${loan.id}/charges`, { amount: 100, date: TODAY });
    await actor.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: 500_000 });
    expect(await balanceOfAccount(actor, account.id)).toBe(1_850_000);

    expect((await actor.delete(`/api/debts/${loan.id}`)).status).toBe(204);
    expect((await actor.get(`/api/debts/${loan.id}`)).status).toBe(404);
    expect((await actor.get('/api/transactions?type=debt_payment')).body.total).toBe(0);
    expect(await balanceOfAccount(actor, account.id)).toBe(2_000_000);
    const stored = await db.execute(sql`SELECT 1 FROM debt_entries`);
    expect(stored.rows).toEqual([]);
    // прибуток, яким поповнювали рахунок, лишився
    expect((await actor.get('/api/transactions')).body.total).toBe(1);
  });

  it('видалення однієї позики не чіпає платежі іншої', async () => {
    const { actor, account, loan, pay } = await setup();
    await pay({ amount: 100_000 });
    const { body: other } = await actor.post('/api/debts', loanInput({ name: 'Друга' }));
    await actor.post(`/api/debts/${other.id}/payments`, {
      accountId: account.id,
      amount: 70_000,
      date: TODAY,
    });

    await actor.delete(`/api/debts/${loan.id}`);
    expect((await details(actor, other.id)).entries).toHaveLength(1);
    expect(await balanceOfAccount(actor, account.id)).toBe(1_930_000);
  });

  it('платіж по боргу не змінюється й не видаляється через /api/transactions', async () => {
    const { actor, account, pay } = await setup();
    await pay({ amount: 100_000 });
    const { body: list } = await actor.get('/api/transactions?type=debt_payment');
    const id = list.items[0].id;

    const replaced = await actor.put(`/api/transactions/${id}`, {
      type: 'expense',
      accountId: account.id,
      amountMinor: 1,
      occurredAt: NOW,
    });
    expect(replaced.status).toBe(400);
    expect((await actor.delete(`/api/transactions/${id}`)).status).toBe(400);
  });
});
