import { describe, expect, it } from 'vitest';
import {
  getCardLimitState,
  getDebtBalance,
  getMonthPayment,
  getPaymentStatus,
  getRequiredPayment,
  isEarlyPayment,
  missesMaturity,
  monthlyInterest,
  monthlyRatePercent,
  nextDueDate,
  paymentDueDate,
  projectPayoff,
  requiredPaymentForMaturity,
  suggestPaymentSplit,
  summarizeDebts,
  toAnnualRatePercent,
  toMonthlyRate,
  type DebtForSummary,
} from '../calculations.ts';

const ZERO = toMonthlyRate(0, 'year');
const THREE_PERCENT = toMonthlyRate(36, 'year');

describe('toMonthlyRate', () => {
  it('36% річних — це 3% на місяць', () => {
    expect(monthlyRatePercent(toMonthlyRate(36, 'year'))).toBe(3);
  });

  it('місячна ставка лишається собою', () => {
    expect(monthlyRatePercent(toMonthlyRate(3.1, 'month'))).toBe(3.1);
  });

  it('денна 1% — це 30,4167% на місяць (365 / 12 днів)', () => {
    expect(monthlyRatePercent(toMonthlyRate(1, 'day'))).toBe(30.4167);
  });

  it('ставка з чотирма знаками не втрачає точності', () => {
    expect(monthlyRatePercent(toMonthlyRate(24.99, 'year'))).toBe(2.0825);
    expect(monthlyInterest(10_000_00, toMonthlyRate(24.99, 'year'))).toBe(20_825);
  });

  it('річна ставка для порівняння боргів', () => {
    expect(toAnnualRatePercent(24.99, 'year')).toBe(24.99);
    expect(toAnnualRatePercent(3.1, 'month')).toBe(37.2);
    expect(toAnnualRatePercent(1, 'day')).toBe(365);
  });
});

describe('monthlyInterest', () => {
  it('округлює до копійки, половину — вгору', () => {
    expect(monthlyInterest(100_000, THREE_PERCENT)).toBe(3_000);
    expect(monthlyInterest(50, THREE_PERCENT)).toBe(2); // 1,5 копійки
    expect(monthlyInterest(49, THREE_PERCENT)).toBe(1); // 1,47 копійки
  });

  it('нульовий залишок і нульова ставка не дають відсотків', () => {
    expect(monthlyInterest(0, THREE_PERCENT)).toBe(0);
    expect(monthlyInterest(-500, THREE_PERCENT)).toBe(0);
    expect(monthlyInterest(100_000, ZERO)).toBe(0);
  });
});

describe('suggestPaymentSplit', () => {
  it('спершу відсотки за місяць, решта — в тіло', () => {
    expect(suggestPaymentSplit(100_000, THREE_PERCENT, 10_000)).toEqual({
      interestPart: 3_000,
      principalPart: 7_000,
    });
  });

  it('ставка 0 — усе в тіло боргу', () => {
    expect(suggestPaymentSplit(100_000, ZERO, 10_000)).toEqual({
      interestPart: 0,
      principalPart: 10_000,
    });
  });

  it('платіж менший за відсотки — усе у відсотки', () => {
    expect(suggestPaymentSplit(100_000, THREE_PERCENT, 2_000)).toEqual({
      interestPart: 2_000,
      principalPart: 0,
    });
  });
});

describe('getDebtBalance', () => {
  it('позика: початкова сума + нарахування − тіло платежів ± звірки', () => {
    const loan = { type: 'bank_loan' as const, initialAmount: 100_000 };
    expect(getDebtBalance(loan, { charges: 5_000, principalPaid: 30_000, adjustments: 0 })).toBe(
      75_000,
    );
    expect(getDebtBalance(loan, { charges: 0, principalPaid: 0, adjustments: -1_500 })).toBe(
      98_500,
    );
    expect(getDebtBalance(loan, { charges: 0, principalPaid: 0, adjustments: 2_000 })).toBe(
      102_000,
    );
  });

  it('позика не має від’ємного залишку', () => {
    const loan = { type: 'installment' as const, initialAmount: 10_000 };
    expect(getDebtBalance(loan, { charges: 0, principalPaid: 12_000, adjustments: 0 })).toBe(0);
  });

  it('кредитка: борг — це від’ємний баланс рахунку', () => {
    const card = { type: 'credit_card' as const, initialAmount: 0 };
    expect(getDebtBalance(card, { accountBalance: -23_400 })).toBe(23_400);
    expect(getDebtBalance(card, { accountBalance: 0 })).toBe(0);
  });

  it('кредитка з додатним балансом (власні кошти) — борг 0', () => {
    const card = { type: 'credit_card' as const, initialAmount: 0 };
    expect(getDebtBalance(card, { accountBalance: 5_000 })).toBe(0);
  });

  it('дані не того виду — помилка, а не тихий нуль', () => {
    expect(() =>
      getDebtBalance(
        { type: 'credit_card', initialAmount: 0 },
        {
          charges: 0,
          principalPaid: 0,
          adjustments: 0,
        },
      ),
    ).toThrow();
    expect(() =>
      getDebtBalance({ type: 'bank_loan', initialAmount: 0 }, { accountBalance: 0 }),
    ).toThrow();
  });
});

describe('getCardLimitState', () => {
  it('частина ліміту використана', () => {
    expect(getCardLimitState(5_000_000, -2_340_000)).toEqual({
      available: 2_660_000,
      usage: 0.468,
      overLimitBy: 0,
      nearLimit: false,
    });
  });

  it('перевищення ліміту', () => {
    expect(getCardLimitState(100_000, -120_000)).toMatchObject({
      available: -20_000,
      overLimitBy: 20_000,
      nearLimit: true,
    });
  });

  it('usage ≥ 0,9 — ліміт майже вичерпано', () => {
    expect(getCardLimitState(100_000, -90_000).nearLimit).toBe(true);
    expect(getCardLimitState(100_000, -89_999).nearLimit).toBe(false);
  });

  it('власні кошти на картці збільшують доступну суму', () => {
    expect(getCardLimitState(100_000, 5_000)).toEqual({
      available: 105_000,
      usage: 0,
      overLimitBy: 0,
      nearLimit: false,
    });
  });
});

describe('paymentDueDate', () => {
  it('день платежу в місяці', () => {
    expect(paymentDueDate('2026-10', 25)).toBe('2026-10-25');
    expect(paymentDueDate('2026-10', 5)).toBe('2026-10-05');
  });

  it('31-ше в коротшому місяці — його останній день', () => {
    expect(paymentDueDate('2026-02', 31)).toBe('2026-02-28');
    expect(paymentDueDate('2028-02', 31)).toBe('2028-02-29');
    expect(paymentDueDate('2026-04', 31)).toBe('2026-04-30');
  });
});

describe('getRequiredPayment', () => {
  it('плановий платіж, але не більше за борг', () => {
    expect(getRequiredPayment(10_000, 100_000, 0)).toBe(10_000);
    expect(getRequiredPayment(10_000, 4_000, 0)).toBe(4_000);
    expect(getRequiredPayment(10_000, 4_000, 3_000)).toBe(7_000);
    expect(getRequiredPayment(10_000, 0, 0)).toBe(0);
  });
});

describe('getPaymentStatus', () => {
  const status = (required: number, paid: number, today: string) =>
    getPaymentStatus(required, paid, '2026-10-25', today);

  it('none — платити нічого', () => {
    expect(status(0, 0, '2026-10-30')).toBe('none');
  });

  it('paid — сплачено потрібне або більше, навіть після дати', () => {
    expect(status(10_000, 10_000, '2026-10-10')).toBe('paid');
    expect(status(10_000, 15_000, '2026-10-30')).toBe('paid');
  });

  it('partial — сплачено частину до дати платежу', () => {
    expect(status(10_000, 4_000, '2026-10-25')).toBe('partial');
  });

  it('overdue — наступного дня після dueDate, зокрема з частковою оплатою', () => {
    expect(status(10_000, 0, '2026-10-25')).not.toBe('overdue');
    expect(status(10_000, 0, '2026-10-26')).toBe('overdue');
    expect(status(10_000, 4_000, '2026-10-26')).toBe('overdue');
  });

  it('due_soon — до платежу три дні або менше', () => {
    expect(status(10_000, 0, '2026-10-22')).toBe('due_soon');
    expect(status(10_000, 0, '2026-10-25')).toBe('due_soon');
  });

  it('pending — до платежу більше трьох днів', () => {
    expect(status(10_000, 0, '2026-10-21')).toBe('pending');
    expect(status(10_000, 0, '2026-10-01')).toBe('pending');
  });
});

describe('getMonthPayment', () => {
  const base = {
    month: '2026-10',
    paymentDay: 10,
    startDate: '2026-01-15',
    monthlyPayment: 10_000,
    balanceAtMonthStart: 100_000,
    chargesInMonth: 0,
    paid: 0,
    today: '2026-10-01',
  };

  it('звичайний місяць', () => {
    expect(getMonthPayment(base)).toEqual({
      dueDate: '2026-10-10',
      required: 10_000,
      paid: 0,
      status: 'pending',
    });
  });

  it('борг почався після дати платежу цього місяця — перший платіж наступного', () => {
    expect(getMonthPayment({ ...base, startDate: '2026-10-11' })).toMatchObject({
      required: 0,
      status: 'none',
    });
    expect(getMonthPayment({ ...base, startDate: '2026-10-10' }).required).toBe(10_000);
  });

  it('день платежу 31 у лютому — останній день місяця', () => {
    expect(getMonthPayment({ ...base, month: '2026-02', paymentDay: 31 }).dueDate).toBe(
      '2026-02-28',
    );
  });

  it('нульовий залишок — статус none', () => {
    expect(getMonthPayment({ ...base, balanceAtMonthStart: 0 }).status).toBe('none');
  });
});

describe('isEarlyPayment', () => {
  it('достроковий, якщо за місяць сплачено більше потрібного', () => {
    expect(isEarlyPayment(10_000, 0, 10_000)).toBe(false);
    expect(isEarlyPayment(10_000, 0, 10_001)).toBe(true);
    expect(isEarlyPayment(10_000, 10_000, 1)).toBe(true);
    expect(isEarlyPayment(10_000, 4_000, 6_000)).toBe(false);
  });
});

describe('projectPayoff', () => {
  const project = (balance: number, rate = ZERO, monthlyPayment = 270_000) =>
    projectPayoff({ balance, rate, monthlyPayment, firstDueDate: '2026-11-10', paymentDay: 10 });

  it('ставка 0 — ceil(balance / payment) місяців', () => {
    expect(project(1_200_000)).toEqual({
      months: 5,
      payoffDate: '2027-03-10',
      totalInterest: 0,
      paymentCoversInterest: true,
    });
    expect(project(270_000).months).toBe(1);
    expect(project(270_001).months).toBe(2);
  });

  it('з відсотками: останній платіж менший, відсотки підсумовуються', () => {
    // 100 000 під 3%: +3 000 −60 000 = 43 000; +1 290 −44 290 = 0
    expect(project(100_000, THREE_PERCENT, 60_000)).toEqual({
      months: 2,
      payoffDate: '2026-12-10',
      totalInterest: 4_290,
      paymentCoversInterest: true,
    });
  });

  it('платіж не покриває відсотки — борг не погашається', () => {
    const never = { months: null, payoffDate: null, totalInterest: null };
    expect(project(100_000, THREE_PERCENT, 3_000)).toEqual({
      ...never,
      paymentCoversInterest: false,
    });
    expect(project(100_000, THREE_PERCENT, 2_000).paymentCoversInterest).toBe(false);
  });

  it('понад 600 місяців — не погашається, хоча платіж покриває відсотки', () => {
    expect(project(100_000_000, ZERO, 1)).toEqual({
      months: null,
      payoffDate: null,
      totalInterest: null,
      paymentCoversInterest: true,
    });
  });

  it('боргу немає', () => {
    expect(project(0)).toEqual({
      months: 0,
      payoffDate: null,
      totalInterest: 0,
      paymentCoversInterest: true,
    });
  });

  it('дата останнього платежу враховує короткі місяці', () => {
    const result = projectPayoff({
      balance: 30_000,
      rate: ZERO,
      monthlyPayment: 10_000,
      firstDueDate: '2026-12-31',
      paymentDay: 31,
    });
    expect(result.payoffDate).toBe('2027-02-28');
  });
});

describe('requiredPaymentForMaturity і попередження про строк', () => {
  const input = {
    balance: 1_200_000,
    rate: ZERO,
    firstDueDate: '2026-11-10',
    paymentDay: 10,
    maturityDate: '2027-02-10',
  };

  it('ставка 0: борг ділиться на платежі, що лишилися до строку', () => {
    // платежі 10.11, 10.12, 10.01, 10.02 — чотири
    expect(requiredPaymentForMaturity(input)).toBe(300_000);
  });

  it('прогноз пізніше строку — попередження', () => {
    const projection = projectPayoff({ ...input, monthlyPayment: 270_000 });
    expect(projection.payoffDate).toBe('2027-03-10');
    expect(missesMaturity(projection, input.maturityDate, input.balance)).toBe(true);

    const onTime = projectPayoff({ ...input, monthlyPayment: 300_000 });
    expect(missesMaturity(onTime, input.maturityDate, input.balance)).toBe(false);
  });

  it('з відсотками знаходить мінімальний платіж', () => {
    const withRate = {
      ...input,
      balance: 100_000,
      rate: THREE_PERCENT,
      maturityDate: '2026-12-10',
    };
    const payment = requiredPaymentForMaturity(withRate);
    const project = (monthlyPayment: number) => projectPayoff({ ...withRate, monthlyPayment });
    expect(project(payment).months).toBe(2);
    expect(project(payment - 1).months).toBe(3);
  });

  it('до строку не лишилося дат платежу — потрібно сплатити все одразу', () => {
    expect(requiredPaymentForMaturity({ ...input, maturityDate: '2026-11-01' })).toBe(1_200_000);
    expect(
      requiredPaymentForMaturity({
        ...input,
        balance: 100_000,
        rate: THREE_PERCENT,
        maturityDate: '2026-11-10',
      }),
    ).toBe(103_000);
  });

  it('без строку, без боргу або з боргом, що не погашається', () => {
    const never = projectPayoff({ ...input, rate: THREE_PERCENT, monthlyPayment: 1 });
    expect(missesMaturity(never, input.maturityDate, input.balance)).toBe(true);
    expect(missesMaturity(never, null, input.balance)).toBe(false);
    expect(missesMaturity(never, input.maturityDate, 0)).toBe(false);
    expect(requiredPaymentForMaturity({ ...input, balance: 0 })).toBe(0);
  });
});

describe('nextDueDate', () => {
  const payment = { dueDate: '2026-10-10', required: 10_000, paid: 0, status: 'pending' as const };

  it('несплачений платіж цього місяця — найближчий', () => {
    expect(nextDueDate('2026-10', 10, payment)).toBe('2026-10-10');
    expect(nextDueDate('2026-10', 10, { ...payment, paid: 4_000 })).toBe('2026-10-10');
  });

  it('сплачений або непотрібний — наступного місяця', () => {
    expect(nextDueDate('2026-10', 10, { ...payment, paid: 10_000 })).toBe('2026-11-10');
    expect(nextDueDate('2026-12', 31, { ...payment, required: 0 })).toBe('2027-01-31');
  });
});

describe('summarizeDebts', () => {
  const debt = (override: Partial<DebtForSummary>): DebtForSummary => ({
    type: 'bank_loan',
    status: 'active',
    balance: 100_000,
    monthlyPayment: 10_000,
    annualRatePercent: 20,
    month: { required: 10_000, paid: 0, status: 'pending' },
    payoffDate: '2027-06-10',
    cardAvailable: null,
    ...override,
  });

  it('підсумки активних боргів', () => {
    const summary = summarizeDebts([
      debt({}),
      debt({
        type: 'credit_card',
        balance: 300_000,
        monthlyPayment: 20_000,
        annualRatePercent: 40,
        month: { required: 20_000, paid: 5_000, status: 'partial' },
        payoffDate: '2029-04-25',
        cardAvailable: 200_000,
      }),
      debt({ month: { required: 10_000, paid: 10_000, status: 'paid' }, payoffDate: '2026-12-10' }),
    ]);
    expect(summary).toEqual({
      totalBalance: 500_000,
      totalMonthlyPayments: 40_000,
      // (100 000·20 + 300 000·40 + 100 000·20) / 500 000
      weightedAnnualRate: 32,
      dueThisMonth: 25_000,
      debtFreeDate: '2029-04-25',
      totalCreditAvailable: 200_000,
    });
  });

  it('закриті борги й борги без залишку не входять у платежі та ставку', () => {
    const summary = summarizeDebts([
      debt({ status: 'closed' }),
      debt({ balance: 0, month: { required: 0, paid: 0, status: 'none' }, payoffDate: null }),
      debt({ annualRatePercent: 12.5 }),
    ]);
    expect(summary).toMatchObject({
      totalBalance: 100_000,
      totalMonthlyPayments: 10_000,
      weightedAnnualRate: 12.5,
      debtFreeDate: '2027-06-10',
    });
  });

  it('борг, що не погашається, — дати виходу з боргів немає', () => {
    expect(summarizeDebts([debt({}), debt({ payoffDate: null })]).debtFreeDate).toBeNull();
  });

  it('боргів немає', () => {
    expect(summarizeDebts([])).toEqual({
      totalBalance: 0,
      totalMonthlyPayments: 0,
      weightedAnnualRate: null,
      dueThisMonth: 0,
      debtFreeDate: null,
      totalCreditAvailable: 0,
    });
  });
});
