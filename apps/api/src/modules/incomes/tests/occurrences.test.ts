import { localMonthKey, shiftMonth } from '@hf/shared';
import { describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { createActor } = setupTestApp();
const MISSING_ID = '11111111-1111-4111-8111-111111111111';

// Місяці відносно сьогодні — для сценаріїв про майбутні надходження; решта тестів
// використовує фіксовані минулі місяці й від дати запуску не залежить.
const THIS_MONTH = localMonthKey(new Date(), 'Europe/Kyiv');
const month = (offset: number) => shiftMonth(THIS_MONTH, offset);

async function setup() {
  const actor = await createActor();
  const account = async (name: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type: 'card', currency })).body;
  return {
    actor,
    card: await account('Картка'),
    cash: await account('Готівка'),
    usd: await account('USD', 'USD'),
  };
}

const createSource = async (actor: Actor, accountId: string, override: object = {}) =>
  (
    await actor.post('/api/income-sources', {
      name: 'Зарплата',
      accountId,
      plannedAmount: 4500000,
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: '2020-01-01',
      ...override,
    })
  ).body;

const incomes = async (actor: Actor, value: string) =>
  (await actor.get(`/api/incomes?month=${value}`)).body;

const receive = (actor: Actor, occurrenceId: string, body: object = {}) =>
  actor.post(`/api/income-occurrences/${occurrenceId}/receive`, body);

describe('лінива генерація надходжень', () => {
  it('повторний запит місяця не дублює надходження', async () => {
    const { actor, card } = await setup();
    const source = await createSource(actor, card.id);

    const first = await incomes(actor, '2020-03');
    const second = await incomes(actor, '2020-03');

    expect(first.occurrences).toEqual([
      {
        id: expect.any(String),
        sourceId: source.id,
        name: 'Зарплата',
        accountId: card.id,
        plannedDate: '2020-03-05',
        plannedAmount: 4500000,
        actualDate: null,
        actualAmount: 0,
        status: 'overdue',
      },
    ]);
    expect(second.occurrences).toEqual(first.occurrences);
    expect(first.summary).toEqual({
      plannedTotal: 4500000,
      receivedTotal: 0,
      receivedRecurring: 0,
      oneTimeTotal: 0,
      expectedRemaining: 4500000,
      counts: { received: 0, partial: 0, pending: 0, overdue: 1, skipped: 0 },
    });
    expect(first).toMatchObject({ month: '2020-03', currency: 'UAH' });
  });

  it('майбутнє надходження — pending; далі ніж на рік уперед не генерується', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id, { dayOfMonth: 15 });

    const next = await incomes(actor, month(1));
    expect(next.occurrences).toHaveLength(1);
    expect(next.occurrences[0]).toMatchObject({
      plannedDate: `${month(1)}-15`,
      status: 'pending',
      actualAmount: 0,
    });
    expect(next.summary.counts.pending).toBe(1);

    expect((await incomes(actor, month(11))).occurrences).toHaveLength(1);
    expect((await incomes(actor, month(14))).occurrences).toEqual([]);
    expect((await incomes(actor, '2099-10')).occurrences).toEqual([]);
  });

  it('враховує початок і кінець джерела та різні частоти', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id, {
      name: 'Оренда',
      startDate: '2020-03-10',
      endDate: '2020-05-05',
    });
    // 2 березня 2020 — понеділок
    await createSource(actor, card.id, {
      name: 'Підробіток',
      frequency: 'biweekly',
      dayOfMonth: null,
      dayOfWeek: 1,
      startDate: '2020-03-01',
      endDate: '2020-03-31',
    });

    const dates = async (value: string) =>
      (await incomes(actor, value)).occurrences.map(
        (item: { name: string; plannedDate: string }) => `${item.name} ${item.plannedDate}`,
      );
    expect(await dates('2020-02')).toEqual([]);
    expect(await dates('2020-03')).toEqual([
      'Підробіток 2020-03-02',
      'Підробіток 2020-03-16',
      'Підробіток 2020-03-30',
    ]);
    expect(await dates('2020-04')).toEqual(['Оренда 2020-04-05']);
    expect(await dates('2020-05')).toEqual(['Оренда 2020-05-05']);
    expect(await dates('2020-06')).toEqual([]);
  });

  it('31-ше число дає останній день коротшого місяця', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id, { dayOfMonth: 31 });
    expect((await incomes(actor, '2020-02')).occurrences[0].plannedDate).toBe('2020-02-29');
    expect((await incomes(actor, '2021-02')).occurrences[0].plannedDate).toBe('2021-02-28');
  });
});

describe('отримання прибутку', () => {
  it('receive двома частинами: partial, потім received', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;

    const first = await receive(actor, occurrence.id, { amount: 2000000, date: '2020-03-05' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      type: 'income',
      occurrenceId: occurrence.id,
      accountId: card.id,
      amountMinor: 2000000,
      description: 'Зарплата',
      // 5 березня 00:00 за Києвом
      occurredAt: '2020-03-04T22:00:00.000Z',
    });

    let view = await incomes(actor, '2020-03');
    expect(view.occurrences[0]).toMatchObject({
      status: 'partial',
      actualAmount: 2000000,
      actualDate: '2020-03-05',
    });
    expect(view.occurrences[0]).not.toHaveProperty('diff');
    expect(view.summary).toMatchObject({
      expectedRemaining: 2500000,
      receivedRecurring: 2000000,
      counts: { received: 0, partial: 1, pending: 0, overdue: 0, skipped: 0 },
    });

    await receive(actor, occurrence.id, { amount: 2500000, date: '2020-03-07' });
    view = await incomes(actor, '2020-03');
    expect(view.occurrences[0]).toMatchObject({
      status: 'received',
      actualAmount: 4500000,
      actualDate: '2020-03-07',
      diff: 0,
    });
    expect(view.summary).toEqual({
      plannedTotal: 4500000,
      receivedTotal: 4500000,
      receivedRecurring: 4500000,
      oneTimeTotal: 0,
      expectedRemaining: 0,
      counts: { received: 1, partial: 0, pending: 0, overdue: 0, skipped: 0 },
    });
  });

  it('без параметрів: запланована сума, сьогодні, рахунок джерела', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id, { dayOfMonth: 15 });
    const [occurrence] = (await incomes(actor, month(1))).occurrences;

    const res = await receive(actor, occurrence.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amountMinor: 4500000, accountId: card.id });
    expect(Math.abs(Date.parse(res.body.occurredAt) - Date.now())).toBeLessThan(60_000);

    const view = await incomes(actor, month(1));
    expect(view.occurrences[0]).toMatchObject({
      status: 'received',
      actualDate: view.today,
      diff: 0,
    });
  });

  it('переплата — received із додатною різницею; можна вказати інший рахунок', async () => {
    const { actor, card, cash } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;

    const res = await receive(actor, occurrence.id, {
      amount: 5000000,
      date: '2020-03-05',
      accountId: cash.id,
    });
    expect(res.body.accountId).toBe(cash.id);
    expect((await incomes(actor, '2020-03')).occurrences[0]).toMatchObject({
      status: 'received',
      diff: 500000,
    });
  });

  it('надходження належить місяцю за plannedDate, а гроші — за датою транзакції', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id, { dayOfMonth: 31 });
    const [march] = (await incomes(actor, '2020-03')).occurrences;

    // зарплата за березень прийшла 1 квітня
    await receive(actor, march.id, { date: '2020-04-01' });

    const marchView = await incomes(actor, '2020-03');
    expect(marchView.occurrences[0]).toMatchObject({
      status: 'received',
      actualDate: '2020-04-01',
    });
    expect(marchView.summary).toMatchObject({ receivedTotal: 0, expectedRemaining: 0 });
    const aprilView = await incomes(actor, '2020-04');
    expect(aprilView.summary).toMatchObject({ receivedRecurring: 4500000, receivedTotal: 4500000 });
  });

  it('видалення транзакції повертає надходження в неотримані', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;
    const { body: transaction } = await receive(actor, occurrence.id, { date: '2020-03-05' });

    const linked = await actor.get(`/api/transactions?occurrenceId=${occurrence.id}`);
    expect(linked.body.items.map((item: { id: string }) => item.id)).toEqual([transaction.id]);

    await actor.delete(`/api/transactions/${transaction.id}`);
    expect((await incomes(actor, '2020-03')).occurrences[0]).toMatchObject({
      status: 'overdue',
      actualAmount: 0,
      actualDate: null,
    });
  });

  it('відхиляє некоректні дані й валютний рахунок', async () => {
    const { actor, card, usd } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;

    const statuses = await Promise.all([
      receive(actor, occurrence.id, { amount: 0 }),
      receive(actor, occurrence.id, { amount: 10.5 }),
      receive(actor, occurrence.id, { date: '2020-02-30' }),
      receive(actor, occurrence.id, { accountId: 'abc' }),
      receive(actor, occurrence.id, { accountId: usd.id }),
      receive(actor, occurrence.id, { accountId: MISSING_ID }),
    ]);
    expect(statuses.map((res) => res.status)).toEqual(Array(6).fill(400));
    expect((await incomes(actor, '2020-03')).occurrences[0].actualAmount).toBe(0);
  });
});

describe('пропуск і зміна одного надходження', () => {
  it('пропущене надходження не входить у план; receive повертає його в очікувані', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;

    const skipped = await actor.patch(`/api/income-occurrences/${occurrence.id}`, {
      status: 'skipped',
    });
    expect(skipped.body).toMatchObject({ id: occurrence.id, status: 'skipped' });
    let view = await incomes(actor, '2020-03');
    expect(view.summary).toMatchObject({
      plannedTotal: 0,
      expectedRemaining: 0,
      counts: { received: 0, partial: 0, pending: 0, overdue: 0, skipped: 1 },
    });

    await receive(actor, occurrence.id, { date: '2020-03-06' });
    view = await incomes(actor, '2020-03');
    expect(view.occurrences[0]).toMatchObject({ status: 'received', diff: 0 });
    expect(view.summary.plannedTotal).toBe(4500000);
  });

  it('пропуск можна скасувати', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;
    await actor.patch(`/api/income-occurrences/${occurrence.id}`, { status: 'skipped' });

    const restored = await actor.patch(`/api/income-occurrences/${occurrence.id}`, {
      status: 'expected',
    });
    expect(restored.body.status).toBe('overdue');
  });

  it('зміна дати й суми одного надходження не змінює джерело й не породжує дубль', async () => {
    const { actor, card } = await setup();
    const source = await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;

    const moved = await actor.patch(`/api/income-occurrences/${occurrence.id}`, {
      plannedDate: '2020-03-10',
      plannedAmount: 4000000,
    });
    expect(moved.body).toMatchObject({ plannedDate: '2020-03-10', plannedAmount: 4000000 });

    // повторна генерація не відтворює надходження на 5-те
    const view = await incomes(actor, '2020-03');
    expect(view.occurrences).toHaveLength(1);
    expect(view.occurrences[0]).toMatchObject({ id: occurrence.id, plannedDate: '2020-03-10' });

    expect((await incomes(actor, '2020-04')).occurrences[0]).toMatchObject({
      plannedDate: '2020-04-05',
      plannedAmount: 4500000,
    });
    expect((await actor.get('/api/income-sources')).body.items[0]).toMatchObject({
      id: source.id,
      plannedAmount: 4500000,
      dayOfMonth: 5,
    });
  });

  it('надходження можна перенести в інший місяць, але не на дату іншого надходження джерела', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id);
    const [march] = (await incomes(actor, '2020-03')).occurrences;
    await incomes(actor, '2020-04');

    const conflict = await actor.patch(`/api/income-occurrences/${march.id}`, {
      plannedDate: '2020-04-05',
    });
    expect(conflict.status).toBe(409);

    await actor.patch(`/api/income-occurrences/${march.id}`, { plannedDate: '2020-04-02' });
    expect((await incomes(actor, '2020-03')).occurrences).toEqual([]);
    expect(
      (await incomes(actor, '2020-04')).occurrences.map(
        (item: { plannedDate: string }) => item.plannedDate,
      ),
    ).toEqual(['2020-04-02', '2020-04-05']);
  });

  it('відхиляє некоректні зміни', async () => {
    const { actor, card } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;
    const patch = (body: object) => actor.patch(`/api/income-occurrences/${occurrence.id}`, body);

    const statuses = await Promise.all([
      patch({}),
      patch({ plannedAmount: 0 }),
      patch({ plannedDate: '2020-13-01' }),
      patch({ status: 'received' }),
    ]);
    expect(statuses.map((res) => res.status)).toEqual([400, 400, 400, 400]);
  });
});

describe('зміна джерела', () => {
  async function scenario() {
    const { actor, card } = await setup();
    const source = await createSource(actor, card.id, {
      dayOfMonth: 15,
      startDate: `${month(-3)}-01`,
    });
    // минулий місяць відкривали, позаминулий — ні
    await incomes(actor, month(-1));
    await incomes(actor, month(1));
    const [future] = (await incomes(actor, month(2))).occurrences;
    await receive(actor, future.id, { amount: 4500000 });
    return { actor, source, future };
  }

  const only = async (actor: Actor, value: string) => {
    const view = await incomes(actor, value);
    expect(view.occurrences).toHaveLength(1);
    return view.occurrences[0];
  };

  it('зміна суми змінює майбутні, але не отримані й не минулі надходження', async () => {
    const { actor, source, future } = await scenario();

    const res = await actor.patch(`/api/income-sources/${source.id}`, { plannedAmount: 5000000 });
    expect(res.status).toBe(200);

    expect(await only(actor, month(-1))).toMatchObject({
      plannedAmount: 4500000,
      status: 'overdue',
    });
    // позаминулий місяць до зміни не відкривали — у ньому теж стара сума
    expect(await only(actor, month(-2))).toMatchObject({ plannedAmount: 4500000 });
    expect(await only(actor, month(1))).toMatchObject({
      plannedAmount: 5000000,
      status: 'pending',
    });
    expect(await only(actor, month(2))).toMatchObject({
      id: future.id,
      plannedAmount: 4500000,
      status: 'received',
    });
    expect(await only(actor, month(3))).toMatchObject({ plannedAmount: 5000000 });
  });

  it('зміна дня переносить майбутні надходження й не чіпає минулі', async () => {
    const { actor, source } = await scenario();

    await actor.patch(`/api/income-sources/${source.id}`, { dayOfMonth: 20 });

    expect((await only(actor, month(-1))).plannedDate).toBe(`${month(-1)}-15`);
    expect((await only(actor, month(-2))).plannedDate).toBe(`${month(-2)}-15`);
    expect((await only(actor, month(1))).plannedDate).toBe(`${month(1)}-20`);
    expect((await only(actor, month(3))).plannedDate).toBe(`${month(3)}-20`);
  });

  it('зміна назви не чіпає надходження', async () => {
    const { actor, source } = await scenario();
    const before = await only(actor, month(1));

    await actor.patch(`/api/income-sources/${source.id}`, { name: 'Оклад' });

    expect(await only(actor, month(1))).toEqual({ ...before, name: 'Оклад' });
  });

  it('деактивація прибирає майбутні неотримані надходження, історія лишається', async () => {
    const { actor, source, future } = await scenario();

    const res = await actor.post(`/api/income-sources/${source.id}/deactivate`, {});
    expect(res.body.isActive).toBe(false);

    expect(await only(actor, month(-1))).toMatchObject({ status: 'overdue' });
    expect(await only(actor, month(-2))).toMatchObject({ plannedAmount: 4500000 });
    expect((await incomes(actor, month(1))).occurrences).toEqual([]);
    expect(await only(actor, month(2))).toMatchObject({ id: future.id, status: 'received' });
    expect((await incomes(actor, month(3))).occurrences).toEqual([]);
  });

  it('видалення джерела з транзакціями — 409; без них — видаляється разом із надходженнями', async () => {
    const { actor, source, future } = await scenario();

    expect((await actor.delete(`/api/income-sources/${source.id}`)).status).toBe(409);

    const linked = await actor.get(`/api/transactions?occurrenceId=${future.id}`);
    await actor.delete(`/api/transactions/${linked.body.items[0].id}`);
    expect((await actor.delete(`/api/income-sources/${source.id}`)).status).toBe(204);
    expect((await incomes(actor, month(-1))).occurrences).toEqual([]);
    expect((await incomes(actor, month(1))).occurrences).toEqual([]);
  });
});

describe('ізоляція домогосподарств', () => {
  it('чужі надходження — 404, і в розрахунки вони не потрапляють', async () => {
    const owner = await setup();
    const stranger = await setup();
    await createSource(owner.actor, owner.card.id);
    const [occurrence] = (await incomes(owner.actor, '2020-03')).occurrences;
    await receive(owner.actor, occurrence.id, { date: '2020-03-05' });

    const view = await incomes(stranger.actor, '2020-03');
    expect(view.occurrences).toEqual([]);
    expect(view.summary).toMatchObject({ plannedTotal: 0, receivedTotal: 0 });

    const attempts = await Promise.all([
      stranger.actor.patch(`/api/income-occurrences/${occurrence.id}`, { status: 'skipped' }),
      receive(stranger.actor, occurrence.id, { accountId: stranger.card.id }),
      stranger.actor.patch(`/api/income-occurrences/${MISSING_ID}`, { status: 'skipped' }),
    ]);
    expect(attempts.map((res) => res.status)).toEqual([404, 404, 404]);

    // прив'язати власну транзакцію до чужого надходження теж не можна
    const linked = await stranger.actor.post('/api/transactions', {
      type: 'income',
      accountId: stranger.card.id,
      occurrenceId: occurrence.id,
      amountMinor: 100,
      occurredAt: '2020-03-05T10:00:00Z',
    });
    expect(linked.status).toBe(400);

    expect((await incomes(owner.actor, '2020-03')).occurrences[0]).toMatchObject({
      status: 'received',
      actualAmount: 4500000,
    });
  });

  it('надходження не можна привʼязати до витрати чи переказу', async () => {
    const { actor, card, cash } = await setup();
    await createSource(actor, card.id);
    const [occurrence] = (await incomes(actor, '2020-03')).occurrences;
    const base = { accountId: card.id, amountMinor: 100, occurredAt: '2020-03-05T10:00:00Z' };

    const responses = await Promise.all([
      actor.post('/api/transactions', { ...base, type: 'expense', occurrenceId: occurrence.id }),
      actor.post('/api/transactions', {
        ...base,
        type: 'transfer',
        toAccountId: cash.id,
        occurrenceId: occurrence.id,
      }),
    ]);
    expect(responses.map((res) => res.status)).toEqual([400, 400]);
  });
});
