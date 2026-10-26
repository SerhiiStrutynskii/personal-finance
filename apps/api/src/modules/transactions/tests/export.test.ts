import { sql } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';

const { app, db, client, createActor, setNow, insertTransaction } = setupTestApp();

// «Зараз» — вечір 31 березня 2026 за Києвом: видатки з датами березня належать до поточного періоду.
const NOW = '2026-03-31T20:30:00Z';
beforeEach(() => setNow(NOW));

const BOM = '﻿';
const HEADER = 'Дата;Сума;Валюта;Категорія;Рахунок;Опис';
const EMPTY = `${BOM}${HEADER}\r\n`;
const MARCH = '/api/transactions/export.csv?month=2026-03';

async function createFixtures(actor: Actor) {
  const account = async (name: string, currency = 'UAH') =>
    (await actor.post('/api/accounts', { name, type: 'card', currency })).body as { id: string };
  const category = async (name: string, kind = 'expense', parentId: string | null = null) =>
    (await actor.post('/api/categories', { name, kind, parentId })).body as { id: string };
  const card = await account('Картка');
  const usd = await account('Долари', 'USD');
  const groceries = await category('Продукти');
  return { card, usd, groceries, account, category };
}

/** Витрата напряму в базі (оминає правила дат API), сума в копійках. */
function expense(
  actor: Actor,
  accountId: string,
  occurredAt: string,
  values: {
    amountMinor?: number;
    currency?: string;
    categoryId?: string;
    description?: string;
  } = {},
) {
  return insertTransaction(actor, {
    type: 'expense',
    accountId,
    amountMinor: 100,
    currency: 'UAH',
    occurredAt: new Date(occurredAt),
    ...values,
  });
}

/** Рядки даних файлу (без BOM, заголовка й завершального \r\n). */
function dataLines(text: string): string[] {
  expect(text.startsWith(`${BOM}${HEADER}\r\n`)).toBe(true);
  expect(text.endsWith('\r\n')).toBe(true);
  const body = text.slice(BOM.length + HEADER.length + 2, -2);
  return body === '' ? [] : body.split('\r\n');
}

describe('GET /api/transactions/export.csv', () => {
  it('AC1–AC3: віддає CSV-файл місяця з потрібними заголовками й рядком витрати', async () => {
    const actor = await createActor();
    const { card, groceries } = await createFixtures(actor);
    const created = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      categoryId: groceries.id,
      amountMinor: 128450,
      description: 'Супермаркет',
      occurredAt: '2026-03-01T10:30:00Z',
    });
    expect(created.status).toBe(201);

    const res = await actor.get(MARCH);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="expenses-2026-03.csv"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toBe(
      `${BOM}${HEADER}\r\n2026-03-01;1284,50;UAH;Продукти;Картка;Супермаркет\r\n`,
    );
  });

  it('AC4: містить лише витрати — без прибутків, переказів, платежів по боргах і коригувань', async () => {
    const actor = await createActor();
    const { card, account } = await createFixtures(actor);
    const cash = await account('Готівка');
    const at = '2026-03-10T10:00:00Z';
    await expense(actor, card.id, at, { description: 'Витрата' });
    const base = { accountId: card.id, amountMinor: 500, occurredAt: at };
    expect(
      (await actor.post('/api/transactions', { ...base, type: 'income', description: 'Прибуток' }))
        .status,
    ).toBe(201);
    expect(
      (
        await actor.post('/api/transactions', {
          ...base,
          type: 'transfer',
          toAccountId: cash.id,
          description: 'Переказ',
        })
      ).status,
    ).toBe(201);
    const { body: loan } = await actor.post('/api/debts', {
      name: 'Позика',
      type: 'bank_loan',
      initialAmount: 1_000_000,
      startDate: '2026-01-15',
      maturityDate: '2027-01-15',
      interestRate: 24,
      ratePeriod: 'year',
      monthlyPayment: 100_000,
      paymentDay: 20,
    });
    await insertTransaction(actor, {
      type: 'debt_payment',
      accountId: card.id,
      debtId: loan.id,
      amountMinor: 700,
      currency: 'UAH',
      description: 'Платіж по боргу',
      occurredAt: new Date(at),
    });
    await insertTransaction(actor, {
      type: 'balance_adjustment',
      accountId: card.id,
      amountMinor: -300,
      currency: 'UAH',
      description: 'Коригування',
      occurredAt: new Date(at),
    });

    const res = await actor.get(MARCH);
    expect(dataLines(res.text)).toEqual(['2026-03-10;1,00;UAH;Без категорії;Картка;Витрата']);
  });

  it('AC5: межі місяця — у часовому поясі домогосподарства, [початок, кінець)', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    await expense(actor, card.id, '2026-02-28T21:59:59Z', { description: 'Лютий' });
    await expense(actor, card.id, '2026-02-28T22:30:00Z', { description: 'Початок березня' });
    await expense(actor, card.id, '2026-03-31T20:59:59Z', { description: 'Кінець березня' });
    await expense(actor, card.id, '2026-03-31T21:00:00Z', { description: 'Квітень' });

    expect(dataLines((await actor.get(MARCH)).text)).toEqual([
      '2026-03-01;1,00;UAH;Без категорії;Картка;Початок березня',
      '2026-03-31;1,00;UAH;Без категорії;Картка;Кінець березня',
    ]);
    expect(dataLines((await actor.get('/api/transactions/export.csv?month=2026-02')).text)).toEqual(
      ['2026-02-28;1,00;UAH;Без категорії;Картка;Лютий'],
    );
    expect(dataLines((await actor.get('/api/transactions/export.csv?month=2026-04')).text)).toEqual(
      ['2026-04-01;1,00;UAH;Без категорії;Картка;Квітень'],
    );
  });

  it('AC6: рядки від старіших до новіших, за однакового часу — за id', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    await expense(actor, card.id, '2026-03-20T10:00:00Z', { description: 'Третя' });
    await expense(actor, card.id, '2026-03-05T10:00:00Z', { description: 'Перша' });
    const sameA = await expense(actor, card.id, '2026-03-10T10:00:00Z', { description: 'A' });
    const sameB = await expense(actor, card.id, '2026-03-10T10:00:00Z', { description: 'B' });
    const byId = [sameA, sameB].sort((a, b) => (a.id < b.id ? -1 : 1)).map((t) => t.description);

    const lines = dataLines((await actor.get(MARCH)).text);
    expect(lines.map((line) => line.split(';')[5])).toEqual(['Перша', ...byId, 'Третя']);
  });

  it('AC7: містить усі витрати місяця, навіть понад ліміт списку (201)', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    await db.execute(sql`
      INSERT INTO transactions (household_id, type, account_id, amount_minor, currency, description, occurred_at)
      SELECT ${actor.householdId}, 'expense', ${card.id}, n, 'UAH', 'Покупка ' || n,
             '2026-03-01T00:00:00Z'::timestamptz + n * interval '1 minute'
      FROM generate_series(1, 201) AS n
    `);

    const lines = dataLines((await actor.get(MARCH)).text);
    expect(lines).toHaveLength(201);
    expect(lines[0]).toBe('2026-03-01;0,01;UAH;Без категорії;Картка;Покупка 1');
    expect(lines[200]).toBe('2026-03-01;2,01;UAH;Без категорії;Картка;Покупка 201');
  });

  it('AC8: валюта кожної витрати окремо, без підсумків', async () => {
    const actor = await createActor();
    const { card, usd } = await createFixtures(actor);
    await expense(actor, usd.id, '2026-03-02T10:00:00Z', {
      amountMinor: 1000,
      currency: 'USD',
      description: 'Підписка',
    });
    await expense(actor, card.id, '2026-03-03T10:00:00Z', { amountMinor: 5000 });

    expect(dataLines((await actor.get(MARCH)).text)).toEqual([
      '2026-03-02;10,00;USD;Без категорії;Долари;Підписка',
      '2026-03-03;50,00;UAH;Без категорії;Картка;',
    ]);
  });

  it('AC9: підкатегорія з батьком, без категорії, архівний рахунок', async () => {
    const actor = await createActor();
    const { card, account, category } = await createFixtures(actor);
    const utilities = await category('Комунальні');
    const water = await category('Вода', 'expense', utilities.id);
    const old = await account('Стара картка');
    await expense(actor, card.id, '2026-03-02T10:00:00Z', { categoryId: water.id });
    await expense(actor, card.id, '2026-03-03T10:00:00Z');
    await expense(actor, old.id, '2026-03-04T10:00:00Z');
    await db.execute(sql`UPDATE accounts SET is_archived = true WHERE id = ${old.id}`);

    expect(dataLines((await actor.get(MARCH)).text)).toEqual([
      '2026-03-02;1,00;UAH;Комунальні › Вода;Картка;',
      '2026-03-03;1,00;UAH;Без категорії;Картка;',
      '2026-03-04;1,00;UAH;Без категорії;Стара картка;',
    ]);
  });

  it('AC10: екранує ; " і перенос рядка, захищає від формул', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    await expense(actor, card.id, '2026-03-02T10:00:00Z', { description: 'Кафе "Ромашка"; обід' });
    await expense(actor, card.id, '2026-03-03T10:00:00Z', { description: 'рядок 1\nрядок 2' });
    await expense(actor, card.id, '2026-03-04T10:00:00Z', { description: '=SUM(A1)' });

    expect((await actor.get(MARCH)).text).toBe(
      `${BOM}${HEADER}\r\n` +
        '2026-03-02;1,00;UAH;Без категорії;Картка;"Кафе ""Ромашка""; обід"\r\n' +
        '2026-03-03;1,00;UAH;Без категорії;Картка;"рядок 1\nрядок 2"\r\n' +
        "2026-03-04;1,00;UAH;Без категорії;Картка;'=SUM(A1)\r\n",
    );
  });

  it('відкриває Content-Disposition для фронтенду з іншого домену (CORS)', async () => {
    const actor = await createActor();
    const res = await actor.get(MARCH).set('Origin', 'http://localhost');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-expose-headers']).toBe('Content-Disposition');
  });

  it('AC11: місяць без витрат — 200 і лише BOM із заголовком', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    await expense(actor, card.id, '2026-03-10T10:00:00Z');

    const res = await actor.get('/api/transactions/export.csv?month=2026-01');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="expenses-2026-01.csv"');
    expect(res.text).toBe(EMPTY);
  });

  it.each([
    ['без month', ''],
    ['2026-13', '?month=2026-13'],
    ['2026-3', '?month=2026-3'],
    ['abc', '?month=abc'],
    ['порожній', '?month='],
    ['масив', '?month=2026-03&month=2026-04'],
  ])('AC12: невалідний місяць (%s) — 400 VALIDATION_ERROR', async (_name, query) => {
    const actor = await createActor();
    const res = await actor.get(`/api/transactions/export.csv${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC13: без токена — 401', async () => {
    const res = await request(app).get(MARCH);
    expect(res.status).toBe(401);
    expect(res.text).not.toContain(HEADER);
  });

  it('AC14: не віддає витрат чужого домогосподарства', async () => {
    const owner = await createActor();
    const { card, groceries } = await createFixtures(owner);
    await expense(owner, card.id, '2026-03-02T10:00:00Z', {
      categoryId: groceries.id,
      description: 'Таємна покупка',
    });
    const stranger = await createActor();

    const res = await stranger.get(MARCH);
    expect(res.status).toBe(200);
    expect(res.text).toBe(EMPTY);

    // свої витрати бачить, чужих — ні
    const own = await stranger.post('/api/accounts', { name: 'Гаманець', type: 'cash' });
    await expense(stranger, own.body.id, '2026-03-05T10:00:00Z', { description: 'Своя' });
    const text = (await stranger.get(MARCH)).text;
    expect(dataLines(text)).toEqual(['2026-03-05;1,00;UAH;Без категорії;Гаманець;Своя']);
    for (const foreign of ['Таємна покупка', 'Картка', 'Продукти']) {
      expect(text).not.toContain(foreign);
    }
  });

  it('AC14: биті посилання на чужі рахунок чи категорію не розкривають їхніх назв', async () => {
    const owner = await createActor();
    const ownFixtures = await createFixtures(owner);
    const stranger = await createActor();
    const foreign = await createFixtures(stranger);
    await stranger.post('/api/categories', { name: 'Чужа', kind: 'expense' });
    // запис власника з категорією іншого домогосподарства (обхід перевірок сервісу)
    await expense(owner, ownFixtures.card.id, '2026-03-02T10:00:00Z', {
      categoryId: foreign.groceries.id,
      description: 'Зі зламаною категорією',
    });
    // і з чужим рахунком: такий рядок не потрапляє взагалі
    await expense(owner, foreign.card.id, '2026-03-03T10:00:00Z', { description: 'Чужий рахунок' });

    const text = (await owner.get(MARCH)).text;
    expect(dataLines(text)).toEqual([
      '2026-03-02;1,00;UAH;Без категорії;Картка;Зі зламаною категорією',
    ]);
  });

  describe('AC15: учасники домогосподарства', () => {
    let counter = 0;
    async function registerMember(owner: Actor) {
      counter += 1;
      const invite = await owner.post('/api/household/invites', {});
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `export-member${counter}@example.com`,
          password: 'a-long-test-password',
          name: `Учасник ${counter}`,
          inviteToken: invite.body.token,
        });
      expect(res.status).toBe(201);
      expect(res.body.household.role).toBe('member');
      return { userId: res.body.user.id as string, ...client(res.body.accessToken as string) };
    }

    it('member отримує той самий файл, що й owner', async () => {
      const owner = await createActor();
      const { card, groceries } = await createFixtures(owner);
      await expense(owner, card.id, '2026-03-02T10:00:00Z', {
        categoryId: groceries.id,
        amountMinor: 128450,
        description: 'Супермаркет',
      });
      const member = await registerMember(owner);

      const fromOwner = await owner.get(MARCH);
      const fromMember = await member.get(MARCH);
      expect(fromMember.status).toBe(200);
      expect(fromMember.text).toBe(fromOwner.text);
      expect(dataLines(fromMember.text)).toEqual([
        '2026-03-02;1284,50;UAH;Продукти;Картка;Супермаркет',
      ]);
    });

    it('вилучений учасник отримує файл свого нового порожнього домогосподарства', async () => {
      const owner = await createActor();
      const { card } = await createFixtures(owner);
      await expense(owner, card.id, '2026-03-02T10:00:00Z', { description: 'Спільна' });
      const member = await registerMember(owner);
      expect(dataLines((await member.get(MARCH)).text)).toHaveLength(1);

      expect((await owner.delete(`/api/household/members/${member.userId}`)).status).toBe(204);

      const res = await member.get(MARCH);
      expect(res.status).toBe(200);
      expect(res.text).toBe(EMPTY);
    });
  });

  it('AC16: маршрут експорту не перехоплює GET /:id і навпаки', async () => {
    const actor = await createActor();
    const { card } = await createFixtures(actor);
    const created = await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.id,
      amountMinor: 100,
      occurredAt: '2026-03-02T10:00:00Z',
    });

    const one = await actor.get(`/api/transactions/${created.body.id}`);
    expect(one.status).toBe(200);
    expect(one.body.id).toBe(created.body.id);

    const notId = await actor.get('/api/transactions/export');
    expect(notId.status).toBe(400);
    expect(notId.body.error.code).toBe('VALIDATION_ERROR');

    expect((await actor.get(MARCH)).status).toBe(200);
  });
});
