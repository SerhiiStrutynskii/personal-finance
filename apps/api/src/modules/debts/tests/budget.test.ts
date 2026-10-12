import { beforeEach, describe, expect, it } from 'vitest';
import { setupTestApp, type Actor } from '../../../test/harness.ts';
import { NOW, TODAY, cardInput, createAccount, fund, loanInput } from './helpers.ts';

const { createActor, setNow } = setupTestApp();
beforeEach(() => setNow(NOW));

const MONTH = '2026-10';

interface Line {
  categoryName: string;
  planned?: number;
  spent: number;
}

async function setup() {
  const actor = await createActor();
  const debit = await createAccount(actor);
  await fund(actor, debit.id, 5_000_000);
  const { body: food } = await actor.post('/api/categories', { name: 'Продукти', kind: 'expense' });
  return { actor, debit, food: food as { id: string } };
}

const getBudget = async (actor: Actor) => (await actor.get(`/api/budgets?month=${MONTH}`)).body;

/** Витрати бюджету за назвою категорії: і з лімітом, і незаплановані. */
async function spentByCategory(actor: Actor): Promise<Record<string, number>> {
  const budget = await getBudget(actor);
  const lines: Line[] = [...budget.expenseLines, ...budget.unplannedExpenses];
  return Object.fromEntries(
    lines.filter((line) => line.spent > 0).map((line) => [line.categoryName, line.spent]),
  );
}

describe('борги в бюджеті: жодних подвійних витрат', () => {
  it('покупка з кредитки потрапляє у витрати своєї категорії, погашення переказом — ні', async () => {
    const { actor, debit, food } = await setup();
    await actor.post('/api/budgets', { month: MONTH });
    const { body: card } = await actor.post('/api/debts', cardInput());

    await actor.post('/api/transactions', {
      type: 'expense',
      accountId: card.accountId,
      categoryId: food.id,
      amountMinor: 150_000,
      occurredAt: '2026-10-05T10:00:00Z',
    });
    expect(await spentByCategory(actor)).toEqual({ Продукти: 150_000 });

    const repaid = await actor.post(`/api/debts/${card.id}/card-payments`, {
      fromAccountId: debit.id,
      amount: 150_000,
      date: TODAY,
    });
    expect(repaid.body.balance).toBe(0);
    expect(await spentByCategory(actor)).toEqual({ Продукти: 150_000 });
    expect((await getBudget(actor)).summary.spentTotal).toBe(150_000);
  });

  it('відсотки по кредитці — витрата «Відсотки та комісії»', async () => {
    const { actor } = await setup();
    await actor.post('/api/budgets', { month: MONTH });
    const { body: card } = await actor.post('/api/debts', cardInput());
    await actor.post(`/api/debts/${card.id}/card-fees`, { amount: 3_100, date: TODAY });
    expect(await spentByCategory(actor)).toEqual({ 'Відсотки та комісії': 3_100 });
  });

  it('платіж по позиці — витрата «Погашення боргів»; нарахування й звірка — ні', async () => {
    const { actor, debit } = await setup();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post('/api/budgets', { month: MONTH });

    await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: debit.id,
      amount: 100_000,
      date: TODAY,
    });
    await actor.post(`/api/debts/${loan.id}/charges`, { amount: 40_000, date: TODAY });
    await actor.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: 900_000 });

    expect(await spentByCategory(actor)).toEqual({ 'Погашення боргів': 100_000 });
    const budget = await getBudget(actor);
    expect(budget.summary.spentTotal).toBe(100_000);
    expect(budget.expenseLines).toEqual([
      expect.objectContaining({
        categoryName: 'Погашення боргів',
        planned: 100_000,
        spent: 100_000,
        status: 'neutral',
      }),
    ]);
  });

  it('службова зміна балансу (початковий борг і звірка кредитки) на бюджет не впливає', async () => {
    const { actor } = await setup();
    await actor.post('/api/budgets', { month: MONTH });
    const { body: card } = await actor.post(
      '/api/debts',
      cardInput({ initialAmount: 500_000, startDate: '2026-10-02' }),
    );
    await actor.post(`/api/debts/${card.id}/adjustments`, { actualBalance: 520_000 });
    await actor.post(`/api/debts/${card.id}/adjustments`, { actualBalance: 480_000 });

    const budget = await getBudget(actor);
    expect(await spentByCategory(actor)).toEqual({});
    expect(budget.summary).toMatchObject({ spentTotal: 0, receivedIncomeTotal: 5_000_000 });
  });

  it('видалення платежу по позиці прибирає його з витрат', async () => {
    const { actor, debit } = await setup();
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post('/api/budgets', { month: MONTH });
    const { body: paid } = await actor.post(`/api/debts/${loan.id}/payments`, {
      accountId: debit.id,
      amount: 100_000,
      date: TODAY,
    });
    await actor.delete(`/api/debts/${loan.id}/entries/${paid.entries[0].id}`);
    expect(await spentByCategory(actor)).toEqual({});
  });
});

describe('типовий ліміт «Погашення боргів»', () => {
  it('новий бюджет отримує ліміт на суму платежів активних позик і розстрочок, без кредиток', async () => {
    const { actor } = await setup();
    await actor.post('/api/debts', loanInput({ monthlyPayment: 100_000 }));
    await actor.post(
      '/api/debts',
      loanInput({ name: 'Розстрочка', type: 'installment', monthlyPayment: 27_000 }),
    );
    await actor.post('/api/debts', cardInput({ initialAmount: 300_000 }));

    const { body } = await actor.post('/api/budgets', { month: MONTH });
    expect(body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Погашення боргів', planned: 127_000, spent: 0 }),
    ]);
    expect(body.summary.plannedExpenseTotal).toBe(127_000);
  });

  it('позика входить у ліміт лише з місяця свого першого платежу', async () => {
    const { actor } = await setup();
    await actor.post('/api/debts', loanInput({ monthlyPayment: 100_000 }));
    await actor.post(
      '/api/debts',
      loanInput({ name: 'Відкладена', monthlyPayment: 40_000, firstPaymentMonth: '2026-11' }),
    );

    const october = await actor.post('/api/budgets', { month: MONTH });
    expect(october.body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Погашення боргів', planned: 100_000 }),
    ]);
    const november = await actor.post('/api/budgets', { month: '2026-11' });
    expect(november.body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Погашення боргів', planned: 140_000 }),
    ]);
  });

  it('без позик ліміту немає; закриті позики не враховуються', async () => {
    const { actor } = await setup();
    await actor.post('/api/debts', cardInput());
    const { body: loan } = await actor.post('/api/debts', loanInput());
    await actor.post(`/api/debts/${loan.id}/adjustments`, { actualBalance: 0 });

    const { body } = await actor.post('/api/budgets', { month: MONTH });
    expect(body.expenseLines).toEqual([]);
    expect((await actor.get('/api/categories')).body.items).toEqual([
      expect.objectContaining({ name: 'Продукти' }),
    ]);
  });

  it('при копіюванні з попереднього місяця беруться скопійовані ліміти', async () => {
    const { actor, food } = await setup();
    const { body: october } = await actor.post('/api/budgets', { month: MONTH });
    await actor.post(`/api/budgets/${october.id}/expense-lines`, {
      categoryId: food.id,
      plannedAmount: 500_000,
    });
    await actor.post('/api/debts', loanInput());

    const { body } = await actor.post('/api/budgets', { month: '2026-11', copyFrom: MONTH });
    expect(body.expenseLines).toEqual([
      expect.objectContaining({ categoryName: 'Продукти', planned: 500_000 }),
    ]);
  });

  it('борги іншого домогосподарства на ліміт не впливають', async () => {
    const { actor } = await setup();
    const stranger = await createActor();
    await stranger.post('/api/debts', loanInput());
    const { body } = await actor.post('/api/budgets', { month: MONTH });
    expect(body.expenseLines).toEqual([]);
  });
});
