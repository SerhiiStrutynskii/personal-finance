import type { Actor } from '../../../test/harness.ts';

/** «Зараз» у тестах боргів: 12 жовтня 2026, 13:00 за Києвом. */
export const NOW = '2026-10-12T10:00:00Z';
export const TODAY = '2026-10-12';
export const MISSING_ID = '11111111-1111-4111-8111-111111111111';

export const loanInput = (override: object = {}) => ({
  name: 'Позика банку',
  type: 'bank_loan',
  initialAmount: 1_000_000,
  startDate: '2026-01-15',
  maturityDate: '2027-01-15',
  interestRate: 24,
  ratePeriod: 'year',
  monthlyPayment: 100_000,
  paymentDay: 20,
  ...override,
});

export const cardInput = (override: object = {}) => ({
  name: 'Кредитка',
  type: 'credit_card',
  initialAmount: 0,
  startDate: '2026-09-01',
  interestRate: 3.1,
  ratePeriod: 'month',
  monthlyPayment: 120_000,
  paymentDay: 25,
  creditLimit: 5_000_000,
  ...override,
});

export async function createAccount(actor: Actor, name = 'Дебетова', override: object = {}) {
  const { body } = await actor.post('/api/accounts', { name, type: 'card', ...override });
  return body as { id: string };
}

/** Поповнює рахунок доходом, щоб на ньому були кошти для платежів. */
export async function fund(actor: Actor, accountId: string, amountMinor: number) {
  await actor.post('/api/transactions', {
    type: 'income',
    accountId,
    amountMinor,
    occurredAt: '2026-10-01T08:00:00Z',
  });
}

export async function balanceOfAccount(actor: Actor, accountId: string): Promise<number> {
  return (await actor.get(`/api/accounts/${accountId}`)).body.balance;
}
