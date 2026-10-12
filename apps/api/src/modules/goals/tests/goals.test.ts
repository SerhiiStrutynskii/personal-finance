import { sql } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, createActor, setNow } = setupTestApp();

// «Зараз» — 12 жовтня 2026, 13:00 за Києвом.
const NOW = '2026-10-12T10:00:00Z';
const TODAY = '2026-10-12';
const MISSING_ID = '11111111-1111-4111-8111-111111111111';
beforeEach(() => setNow(NOW));

async function setup() {
  const actor = await createActor();
  const account = async (name: string, override: object = {}) =>
    (await actor.post('/api/accounts', { name, type: 'card', ...override })).body as { id: string };
  const card = await account('Картка');
  const deposit = await account('Депозит', { type: 'deposit' });
  const income = (accountId: string, amountMinor: number, occurredAt: string) =>
    actor.post('/api/transactions', { type: 'income', accountId, amountMinor, occurredAt });
  await income(card.id, 5_000_000, '2026-10-01T08:00:00Z');
  return { actor, account, card, deposit, income };
}

const savingsInput = (accountId: string, override: object = {}) => ({
  kind: 'savings',
  name: 'Подушка',
  accountId,
  targetAmount: 10_000_000,
  targetDate: '2027-06-30',
  monthlyContribution: 500_000,
  ...override,
});

const loanInput = (override: object = {}) => ({
  name: 'Позика',
  type: 'bank_loan',
  initialAmount: 600_000,
  startDate: '2026-09-10',
  maturityDate: '2030-01-01',
  interestRate: 0,
  ratePeriod: 'year',
  monthlyPayment: 100_000,
  paymentDay: 20,
  ...override,
});

const cardDebtInput = (override: object = {}) => ({
  name: 'Кредитка',
  type: 'credit_card',
  initialAmount: 300_000,
  startDate: '2026-09-01',
  interestRate: 36,
  ratePeriod: 'year',
  monthlyPayment: 50_000,
  paymentDay: 25,
  creditLimit: 5_000_000,
  ...override,
});

const payoffInput = (debtIds: string[], override: object = {}) => ({
  kind: 'debt_payoff',
  name: 'Без боргів',
  debtIds,
  targetDate: '2027-03-31',
  ...override,
});

const goalOf = async (actor: Actor, id: string) => (await actor.get(`/api/goals/${id}`)).body;

describe('ціль накопичення', () => {
  it('створюється на рахунку; баланс рахунку на момент створення зараховано', async () => {
    const { actor, deposit, income } = await setup();
    await income(deposit.id, 2_000_000, '2026-10-05T10:00:00Z');

    const res = await actor.post(
      '/api/goals',
      savingsInput(deposit.id, { description: ' На чорний день ' }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      kind: 'savings',
      name: 'Подушка',
      description: 'На чорний день',
      status: 'active',
      currency: 'UAH',
      targetDate: '2027-06-30',
      accountId: deposit.id,
      accountName: 'Депозит',
      targetAmount: 10_000_000,
      monthlyContribution: 500_000,
      saved: 2_000_000,
      remaining: 8_000_000,
      progress: 0.2,
      // до червня 2027 — 8 місяців
      requiredMonthly: 1_000_000,
      pace: 500_000,
      projectedMonth: '2028-02',
      state: 'behind',
    });
    expect(res.body).not.toHaveProperty('householdId');
  });

  it('поповнення створює переказ на рахунок цілі й збільшує прогрес', async () => {
    const { actor, card, deposit } = await setup();
    const { body: goal } = await actor.post('/api/goals', savingsInput(deposit.id));

    const res = await actor.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: card.id,
      amount: 1_000_000,
      date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ saved: 1_000_000, remaining: 9_000_000, progress: 0.1 });

    const { body: transfers } = await actor.get('/api/transactions?type=transfer');
    expect(transfers.items).toEqual([
      expect.objectContaining({
        accountId: card.id,
        toAccountId: deposit.id,
        amountMinor: 1_000_000,
        description: 'Ціль: Подушка',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ]);
    expect((await actor.get(`/api/accounts/${card.id}`)).body.balance).toBe(4_000_000);
  });

  it('звичайний переказ і видаток з рахунку цілі теж змінюють прогрес', async () => {
    const { actor, card, deposit } = await setup();
    const { body: goal } = await actor.post('/api/goals', savingsInput(deposit.id));
    await actor.post('/api/transactions', {
      type: 'transfer',
      accountId: card.id,
      toAccountId: deposit.id,
      amountMinor: 3_000_000,
      occurredAt: '2026-10-06T10:00:00Z',
    });
    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: deposit.id,
      amountMinor: 500_000,
      occurredAt: '2026-10-07T10:00:00Z',
    });
    expect(await goalOf(actor, goal.id)).toMatchObject({ saved: 2_500_000, progress: 0.25 });
  });

  it('досягнута ціль і ціль без дати', async () => {
    const { actor, deposit, income } = await setup();
    await income(deposit.id, 700_000, '2026-10-05T10:00:00Z');
    const { body: goal } = await actor.post(
      '/api/goals',
      savingsInput(deposit.id, {
        targetAmount: 500_000,
        targetDate: null,
        monthlyContribution: null,
      }),
    );
    expect(goal).toMatchObject({
      saved: 700_000,
      remaining: 0,
      progress: 1,
      targetDate: null,
      requiredMonthly: null,
      projectedMonth: null,
      state: 'achieved',
    });

    const bigger = await actor.patch(`/api/goals/${goal.id}`, { targetAmount: 7_000_000 });
    expect(bigger.body).toMatchObject({ progress: 0.1, state: 'no_deadline', pace: null });
  });

  it('без планового внеску темп — середній приріст за три попередні місяці', async () => {
    const { actor, deposit, income } = await setup();
    // липень–вересень: +300 000, +0, +600 000; жовтень у темп не входить
    await income(deposit.id, 300_000, '2026-07-10T10:00:00Z');
    await income(deposit.id, 600_000, '2026-09-10T10:00:00Z');
    await income(deposit.id, 100_000, '2026-10-02T10:00:00Z');
    // до липня — теж не входить
    await income(deposit.id, 1_000_000, '2026-06-10T10:00:00Z');

    const { body: goal } = await actor.post(
      '/api/goals',
      savingsInput(deposit.id, { monthlyContribution: null, targetAmount: 5_000_000 }),
    );
    expect(goal).toMatchObject({
      saved: 2_000_000,
      pace: 300_000,
      // лишилося 3 000 000 → 10 місяців
      projectedMonth: '2027-08',
      requiredMonthly: 375_000,
      state: 'behind',
    });
  });

  it('стани: встигаєте й строк минув', async () => {
    const { actor, deposit } = await setup();
    const { body: goal } = await actor.post(
      '/api/goals',
      savingsInput(deposit.id, { monthlyContribution: 1_250_000 }),
    );
    expect(goal).toMatchObject({ requiredMonthly: 1_250_000, state: 'on_track' });

    setNow('2027-07-01T10:00:00Z');
    expect(await goalOf(actor, goal.id)).toMatchObject({ requiredMonthly: null, state: 'overdue' });
  });

  it('один рахунок — одна активна ціль; після архівації рахунок вільний', async () => {
    const { actor, deposit } = await setup();
    const { body: first } = await actor.post('/api/goals', savingsInput(deposit.id));
    const second = await actor.post('/api/goals', savingsInput(deposit.id, { name: 'Друга' }));
    expect(second.status).toBe(409);

    const archived = await actor.post(`/api/goals/${first.id}/archive`, {});
    expect(archived.body.status).toBe('archived');
    expect(
      (await actor.post('/api/goals', savingsInput(deposit.id, { name: 'Друга' }))).status,
    ).toBe(201);

    const { body } = await actor.get('/api/goals');
    expect(body.today).toBe(TODAY);
    expect(
      body.goals.map((goal: { name: string; status: string }) => [goal.name, goal.status]),
    ).toEqual([
      ['Друга', 'active'],
      ['Подушка', 'archived'],
    ]);
  });

  it('рахунок: кредитка й архівний — 400, не в гривні — 422, чужий і невідомий — 404', async () => {
    const { actor, account, deposit } = await setup();
    const stranger = await setup();
    const usd = await account('Долари', { currency: 'USD' });
    const { body: credit } = await actor.post('/api/debts', cardDebtInput());
    await db.execute(sql`UPDATE accounts SET is_archived = true WHERE id = ${deposit.id}`);

    const create = (accountId: string) => actor.post('/api/goals', savingsInput(accountId));
    expect((await create(credit.accountId)).status).toBe(400);
    expect((await create(deposit.id)).status).toBe(400);
    const wrongCurrency = await create(usd.id);
    expect(wrongCurrency.status).toBe(422);
    expect(wrongCurrency.body.error.code).toBe('CURRENCY_MISMATCH');
    expect((await create(stranger.deposit.id)).status).toBe(404);
    expect((await create(MISSING_ID)).status).toBe(404);
    expect((await actor.get('/api/goals')).body.goals).toEqual([]);
  });

  it.each([
    ['без назви', { name: ' ' }],
    ['нульова сума цілі', { targetAmount: 0 }],
    ['дробова сума', { targetAmount: 10.5 }],
    ['нульовий внесок', { monthlyContribution: 0 }],
    ['некоректна дата', { targetDate: '2027-02-30' }],
    ['без рахунку', { accountId: undefined }],
    ['невідомий вид', { kind: 'vacation' }],
  ])('відхиляє некоректну ціль накопичення: %s', async (_name, override) => {
    const { actor, deposit } = await setup();
    const res = await actor.post('/api/goals', savingsInput(deposit.id, override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('поповнення: з рахунку цілі — 422, майбутня дата — 422, чужий рахунок — 404, архівна ціль — 409', async () => {
    const { actor, card, deposit } = await setup();
    const stranger = await setup();
    const { body: goal } = await actor.post('/api/goals', savingsInput(deposit.id));
    const contribute = (body: object) =>
      actor.post(`/api/goals/${goal.id}/contributions`, {
        fromAccountId: card.id,
        amount: 100,
        date: TODAY,
        ...body,
      });

    const same = await contribute({ fromAccountId: deposit.id });
    expect(same.status).toBe(422);
    expect(same.body.error.code).toBe('SAME_ACCOUNT');
    const future = await contribute({ date: '2026-10-13' });
    expect(future.status).toBe(422);
    expect(future.body.error.code).toBe('EXPENSE_DATE_IN_FUTURE');
    expect((await contribute({ fromAccountId: stranger.card.id })).status).toBe(404);
    expect((await contribute({ amount: 0 })).status).toBe(400);
    // заднім числом можна
    expect((await contribute({ date: '2026-10-02' })).status).toBe(201);

    await actor.post(`/api/goals/${goal.id}/archive`, {});
    expect((await contribute({})).status).toBe(409);
    expect((await actor.get('/api/transactions?type=transfer')).body.total).toBe(1);
  });

  it('зміна цілі: поля, інший рахунок і поля чужого виду', async () => {
    const { actor, account, deposit } = await setup();
    const other = await account('Скарбничка', { type: 'cash' });
    const { body: goal } = await actor.post('/api/goals', savingsInput(deposit.id));
    const patch = (body: object) => actor.patch(`/api/goals/${goal.id}`, body);

    const updated = await patch({
      name: 'Відпустка',
      targetAmount: 4_000_000,
      targetDate: null,
      monthlyContribution: null,
      accountId: other.id,
    });
    expect(updated.body).toMatchObject({
      name: 'Відпустка',
      targetAmount: 4_000_000,
      targetDate: null,
      monthlyContribution: null,
      accountId: other.id,
      accountName: 'Скарбничка',
    });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ extraPayment: 100 })).status).toBe(400);
    expect((await patch({ strategy: 'snowball' })).status).toBe(400);
    expect((await patch({ accountId: MISSING_ID })).status).toBe(404);
  });

  it('видалення цілі не чіпає рахунок і перекази; рахунок із ціллю не видаляється', async () => {
    const { actor, card, deposit } = await setup();
    const { body: goal } = await actor.post('/api/goals', savingsInput(deposit.id));
    await actor.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: card.id,
      amount: 100_000,
      date: TODAY,
    });
    const empty = await setup();
    const { body: emptyGoal } = await empty.actor.post(
      '/api/goals',
      savingsInput(empty.deposit.id),
    );
    expect((await empty.actor.delete(`/api/accounts/${empty.deposit.id}`)).status).toBe(409);
    await empty.actor.delete(`/api/goals/${emptyGoal.id}`);
    expect((await empty.actor.delete(`/api/accounts/${empty.deposit.id}`)).status).toBe(204);

    expect((await actor.delete(`/api/goals/${goal.id}`)).status).toBe(204);
    expect((await actor.get(`/api/goals/${goal.id}`)).status).toBe(404);
    expect((await actor.get(`/api/accounts/${deposit.id}`)).body.balance).toBe(100_000);
    expect((await actor.get('/api/transactions?type=transfer')).body.total).toBe(1);
  });
});

describe('ціль виходу з боргів', () => {
  async function withDebts() {
    const context = await setup();
    const { actor } = context;
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: credit } = await actor.post('/api/debts', cardDebtInput());
    return {
      ...context,
      loan: loan as { id: string },
      credit: credit as { id: string; accountId: string },
    };
  }

  it('стартовий залишок — сума залишків на момент створення', async () => {
    const { actor, loan, credit } = await withDebts();
    const res = await actor.post('/api/goals', payoffInput([loan.id, credit.id]));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'debt_payoff',
      name: 'Без боргів',
      status: 'active',
      targetDate: '2027-03-31',
      startBalance: 900_000,
      currentBalance: 900_000,
      paid: 0,
      progress: 0,
      extraPayment: 0,
      strategy: 'avalanche',
      minimumPayments: 150_000,
    });
    expect(res.body.debts).toEqual(
      expect.arrayContaining([
        { id: loan.id, name: 'Позика', balance: 600_000 },
        { id: credit.id, name: 'Кредитка', balance: 300_000 },
      ]),
    );
    expect(res.body.debtFreeMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(res.body.requiredMonthly).toBeGreaterThanOrEqual(150_000);
  });

  it('платіж по боргу збільшує прогрес, покупка з кредитки — зменшує', async () => {
    const { actor, card, loan, credit } = await withDebts();
    const { body: goal } = await actor.post('/api/goals', payoffInput([loan.id, credit.id]));

    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 180_000,
      date: TODAY,
    });
    expect(await goalOf(actor, goal.id)).toMatchObject({
      currentBalance: 720_000,
      paid: 180_000,
      progress: 0.2,
    });

    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: credit.accountId,
      amountMinor: 90_000,
      occurredAt: '2026-10-08T10:00:00Z',
    });
    expect(await goalOf(actor, goal.id)).toMatchObject({
      currentBalance: 810_000,
      paid: 90_000,
      progress: 0.1,
    });
  });

  it('стан: встигаєте, відстаєте з потрібним платежем, досягнуто, строк минув', async () => {
    const { actor, card, loan } = await withDebts();
    // 600 000 по 100 000 без відсотків — 6 платежів: жовтень–березень
    const { body: onTrack } = await actor.post('/api/goals', payoffInput([loan.id]));
    expect(onTrack).toMatchObject({
      debtFreeMonth: '2027-03',
      requiredMonthly: 100_000,
      state: 'on_track',
    });

    const { body: behind } = await actor.post(
      '/api/goals',
      payoffInput([loan.id], { name: 'Швидше', targetDate: '2026-12-31' }),
    );
    // 600 000 за 3 місяці
    expect(behind).toMatchObject({ requiredMonthly: 200_000, state: 'behind' });
    const boosted = await actor.patch(`/api/goals/${behind.id}`, { extraPayment: 100_000 });
    expect(boosted.body).toMatchObject({
      extraPayment: 100_000,
      debtFreeMonth: '2026-12',
      state: 'on_track',
    });

    setNow('2027-04-02T10:00:00Z');
    expect((await goalOf(actor, onTrack.id)).state).toBe('overdue');

    setNow(NOW);
    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: card.id,
      amount: 600_000,
      date: TODAY,
    });
    expect(await goalOf(actor, onTrack.id)).toMatchObject({
      currentBalance: 0,
      progress: 1,
      minimumPayments: 0,
      requiredMonthly: null,
      debtFreeMonth: null,
      state: 'achieved',
    });
  });

  it('видалений борг зникає з цілі', async () => {
    const { actor, loan, credit } = await withDebts();
    const { body: goal } = await actor.post('/api/goals', payoffInput([loan.id, credit.id]));
    await actor.delete(`/api/debts/${loan.id}`);

    const after = await goalOf(actor, goal.id);
    expect(after.debts).toEqual([{ id: credit.id, name: 'Кредитка', balance: 300_000 }]);
    expect(after).toMatchObject({ startBalance: 900_000, currentBalance: 300_000 });
  });

  it.each([
    ['без боргів', { debtIds: [] }],
    ['повторювані борги', { debtIds: [MISSING_ID, MISSING_ID] }],
    ['без дати', { targetDate: undefined }],
    ['від’ємний додатковий платіж', { extraPayment: -1 }],
    ['невідома стратегія', { strategy: 'fastest' }],
  ])('відхиляє некоректну ціль виходу з боргів: %s', async (_name, override) => {
    const { actor, loan } = await withDebts();
    const res = await actor.post('/api/goals', payoffInput([loan.id], override));
    expect(res.status).toBe(400);
  });

  it('чужий або невідомий борг — 404; поля накопичення й скидання дати — 400', async () => {
    const { actor, loan } = await withDebts();
    const stranger = await withDebts();
    expect((await actor.post('/api/goals', payoffInput([stranger.loan.id]))).status).toBe(404);
    expect((await actor.post('/api/goals', payoffInput([loan.id, MISSING_ID]))).status).toBe(404);
    expect((await actor.get('/api/goals')).body.goals).toEqual([]);

    const { body: goal } = await actor.post('/api/goals', payoffInput([loan.id]));
    const patch = (body: object) => actor.patch(`/api/goals/${goal.id}`, body);
    expect((await patch({ targetAmount: 100 })).status).toBe(400);
    expect((await patch({ monthlyContribution: 100 })).status).toBe(400);
    expect((await patch({ targetDate: null })).status).toBe(400);
    expect((await patch({ strategy: 'snowball', targetDate: '2028-01-01' })).body).toMatchObject({
      strategy: 'snowball',
      targetDate: '2028-01-01',
    });
  });

  it('поповнення для цілі виходу з боргів — 422', async () => {
    const { actor, card, loan } = await withDebts();
    const { body: goal } = await actor.post('/api/goals', payoffInput([loan.id]));
    const res = await actor.post(`/api/goals/${goal.id}/contributions`, {
      fromAccountId: card.id,
      amount: 100,
      date: TODAY,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GOAL_KIND_MISMATCH');
  });

  it('видалення цілі не чіпає борги', async () => {
    const { actor, loan } = await withDebts();
    const { body: goal } = await actor.post('/api/goals', payoffInput([loan.id]));
    expect((await actor.delete(`/api/goals/${goal.id}`)).status).toBe(204);
    expect((await actor.get(`/api/debts/${loan.id}`)).body.balance).toBe(600_000);
  });
});

describe('план погашення', () => {
  async function withGoal(override: object = {}) {
    const context = await setup();
    const { actor } = context;
    const { body: loan } = await actor.post('/api/debts', loanInput());
    const { body: credit } = await actor.post('/api/debts', cardDebtInput());
    const { body: goal } = await actor.post(
      '/api/goals',
      payoffInput([loan.id, credit.id], {
        extraPayment: 50_000,
        strategy: 'snowball',
        ...override,
      }),
    );
    const plan = async (query = '') =>
      (await actor.get(`/api/goals/${goal.id}/payoff-plan${query}`)).body;
    return { ...context, loan, credit, goal, plan };
  }

  it('за замовчуванням — додатковий платіж і стратегія цілі', async () => {
    const { loan, credit, plan } = await withGoal();
    const body = await plan();

    expect(body).toMatchObject({ extra: 50_000, strategy: 'snowball', withoutExtra: [] });
    // сніжна куля: спершу менший борг — кредитка
    expect(body.plan.payoffOrder.map((item: { debtId: string }) => item.debtId)).toEqual([
      credit.id,
      loan.id,
    ]);
    expect(body.plan.payoffOrder[0].name).toBe('Кредитка');
    expect(body.plan.timeline[0].month).toBe('2026-10');
    expect(body.plan.timeline.at(-1)).toEqual({ month: body.plan.debtFreeMonth, balance: 0 });
    expect(body.plan.months).toBe(body.plan.timeline.length);
    expect(body.baseline.months).toBeGreaterThan(body.plan.months);
    expect(body.monthsSaved).toBe(body.baseline.months - body.plan.months);
    expect(body.interestSaved).toBe(body.baseline.totalInterest - body.plan.totalInterest);
  });

  it('параметри запиту перекривають значення цілі й нічого не зберігають', async () => {
    const { actor, goal, plan } = await withGoal();
    const defaults = await plan();
    const faster = await plan('?extra=300000&strategy=avalanche');

    expect(faster).toMatchObject({ extra: 300_000, strategy: 'avalanche' });
    expect(faster.plan.months).toBeLessThan(defaults.plan.months);
    expect(await goalOf(actor, goal.id)).toMatchObject({
      extraPayment: 50_000,
      strategy: 'snowball',
    });
    expect((await plan('?extra=0')).extra).toBe(0);
  });

  it('збігається зі станом цілі: місяць виходу з боргів той самий', async () => {
    const { actor, goal, plan } = await withGoal();
    expect((await plan()).plan.debtFreeMonth).toBe((await goalOf(actor, goal.id)).debtFreeMonth);
  });

  it('борг без дострокового погашення показано окремо', async () => {
    const context = await setup();
    const { actor } = context;
    const { body: locked } = await actor.post(
      '/api/debts',
      loanInput({ name: 'Розстрочка', type: 'installment', earlyRepaymentAllowed: false }),
    );
    const { body: goal } = await actor.post(
      '/api/goals',
      payoffInput([locked.id], { extraPayment: 500_000 }),
    );
    const { body } = await actor.get(`/api/goals/${goal.id}/payoff-plan`);
    expect(body.withoutExtra).toEqual([{ debtId: locked.id, name: 'Розстрочка' }]);
    // додаткові гроші на нього не йдуть: ті самі 6 місяців
    expect(body.plan.months).toBe(6);
  });

  it('некоректні параметри — 400; для цілі накопичення — 422', async () => {
    const { actor, deposit, goal } = await withGoal();
    for (const query of ['?extra=-1', '?extra=abc', '?extra=10.5', '?strategy=fastest']) {
      expect((await actor.get(`/api/goals/${goal.id}/payoff-plan${query}`)).status).toBe(400);
    }
    const { body: savings } = await actor.post('/api/goals', savingsInput(deposit.id));
    const res = await actor.get(`/api/goals/${savings.id}/payoff-plan`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GOAL_KIND_MISMATCH');
  });
});

describe('ізоляція домогосподарств і доступ', () => {
  it('чужі цілі не видно й не можна змінити', async () => {
    const owner = await setup();
    const stranger = await setup();
    const { body: goal } = await owner.actor.post('/api/goals', savingsInput(owner.deposit.id));
    const path = `/api/goals/${goal.id}`;

    expect((await stranger.actor.get('/api/goals')).body.goals).toEqual([]);
    const responses = await Promise.all([
      stranger.actor.get(path),
      stranger.actor.patch(path, { name: 'x' }),
      stranger.actor.delete(path),
      stranger.actor.post(`${path}/archive`, {}),
      stranger.actor.post(`${path}/contributions`, {
        fromAccountId: stranger.card.id,
        amount: 100,
        date: TODAY,
      }),
      stranger.actor.get(`${path}/payoff-plan`),
    ]);
    expect(responses.map((res) => res.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect((await owner.actor.get(path)).body.name).toBe('Подушка');
  });

  it('без токена — 401', async () => {
    expect((await request(app).get('/api/goals')).status).toBe(401);
  });
});
