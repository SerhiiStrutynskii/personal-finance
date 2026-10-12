import { z } from 'zod';
import { monthSchema } from '../budget/month.ts';
import { dateStringSchema } from '../incomes/schemas.ts';
import { amountMinorSchema, currencySchema, positiveAmountMinorSchema } from '../money.ts';
import { idSchema, transactionSchema } from '../schemas.ts';

export const debtTypeSchema = z.enum(['credit_card', 'installment', 'mfo_loan', 'bank_loan']);
export const ratePeriodSchema = z.enum(['year', 'month', 'day']);
export const debtStatusSchema = z.enum(['active', 'closed']);
export const paymentStatusSchema = z.enum([
  'none',
  'paid',
  'partial',
  'due_soon',
  'pending',
  'overdue',
]);

/** Борги ведуться лише в гривні: підсумки складають суми, а конвертації немає. */
export const DEBT_CURRENCY = 'UAH';

const nonNegativeAmountSchema = amountMinorSchema.nonnegative();

/** Ставка у відсотках, не більше чотирьох знаків після коми. */
export const interestRateSchema = z
  .number()
  .min(0)
  .max(99_999.9999)
  .refine(
    (value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-6,
    'Не більше чотирьох знаків після коми',
  );

const conditionFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullish(),
  /** Дата, до якої виданий борг; обов'язкова для всіх типів, крім кредитної картки. */
  maturityDate: dateStringSchema.nullish(),
  interestRate: interestRateSchema,
  ratePeriod: ratePeriodSchema,
  /** Запланований щомісячний платіж; для кредитки — мінімальний. */
  monthlyPayment: positiveAmountMinorSchema,
  paymentDay: z.number().int().min(1).max(31),
  /** Місяць першого платежу; до нього платити нічого. Без нього — найближчий після startDate. */
  firstPaymentMonth: monthSchema.nullish(),
  earlyRepaymentAllowed: z.boolean(),
  /** Рахунок, з якого зазвичай гаситься борг. */
  defaultAccountId: idSchema.nullish(),
  /** Кредитний ліміт; тоді й лише тоді, коли це кредитна картка. */
  creditLimit: positiveAmountMinorSchema.nullish(),
};

export const createDebtSchema = z
  .object({
    ...conditionFields,
    type: debtTypeSchema,
    currency: z.literal(DEBT_CURRENCY).default(DEBT_CURRENCY),
    /** Сума боргу на startDate. */
    initialAmount: nonNegativeAmountSchema,
    /** Дата видачі або дата, з якої борг ведеться в застосунку. */
    startDate: dateStringSchema,
    earlyRepaymentAllowed: z.boolean().default(true),
    /** Наявний рахунок, який стане рахунком кредитної картки; без нього створюється новий. */
    existingAccountId: idSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const isCard = value.type === 'credit_card';

    if (!isCard && !value.maturityDate) issue('maturityDate', 'Вкажіть дату, до якої виданий борг');
    if (value.maturityDate && value.maturityDate <= value.startDate) {
      issue('maturityDate', 'Строк має бути пізніше за дату початку');
    }
    if (value.firstPaymentMonth && value.firstPaymentMonth < value.startDate.slice(0, 7)) {
      issue('firstPaymentMonth', 'Перший платіж не може бути раніше за місяць початку');
    }
    if (isCard && value.creditLimit == null) issue('creditLimit', 'Вкажіть кредитний ліміт');
    if (!isCard && value.creditLimit != null) {
      issue('creditLimit', 'Кредитний ліміт є лише в кредитної картки');
    }
    if (!isCard && value.existingAccountId) {
      issue('existingAccountId', 'Рахунок прив’язується лише до кредитної картки');
    }
    if (value.existingAccountId && value.initialAmount !== 0) {
      // Борг прив'язаної картки — це її поточний від'ємний баланс.
      issue('initialAmount', 'Для наявного рахунку початкова сума має бути 0');
    }
  })
  .transform((value) => ({
    ...value,
    description: value.description || null,
    maturityDate: value.maturityDate ?? null,
    firstPaymentMonth: value.firstPaymentMonth ?? null,
    defaultAccountId: value.defaultAccountId ?? null,
    creditLimit: value.creditLimit ?? null,
    existingAccountId: value.existingAccountId ?? null,
    // Кредитку можна гасити достроково завжди.
    earlyRepaymentAllowed: value.type === 'credit_card' ? true : value.earlyRepaymentAllowed,
  }));
export type CreateDebtInput = z.infer<typeof createDebtSchema>;

/** Зміна умов; узгодженість із типом боргу перевіряється після злиття з наявними полями. */
export const updateDebtSchema = z
  .object(conditionFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Потрібне хоча б одне поле');
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;

export const debtsQuerySchema = z.object({ month: monthSchema.optional() });
export const debtEntryParamsSchema = z.object({ id: idSchema, entryId: idSchema });

// --- Рухи ---

const noteSchema = z.string().trim().max(500).nullish();

/** Платіж по позиці чи розстрочці з рахунку. Без розбивки вона пропонується за ставкою. */
export const debtPaymentSchema = z
  .object({
    accountId: idSchema,
    amount: positiveAmountMinorSchema,
    date: dateStringSchema,
    principalPart: nonNegativeAmountSchema.optional(),
    interestPart: nonNegativeAmountSchema.optional(),
    /** Підтвердження дострокового платежу, якщо умови боргу його не дозволяють. */
    confirmEarly: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const { principalPart, interestPart } = value;
    if ((principalPart === undefined) !== (interestPart === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['principalPart'],
        message: 'Вкажіть обидві частини платежу або жодної',
      });
    } else if (
      principalPart !== undefined &&
      interestPart !== undefined &&
      principalPart + interestPart !== value.amount
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['principalPart'],
        message: 'Тіло й відсотки разом мають дорівнювати сумі платежу',
      });
    }
  });
export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;

/** Нарахування по позиці (комісія, штраф, відсотки) або відсотки й комісія по кредитці. */
export const debtChargeSchema = z.object({
  amount: positiveAmountMinorSchema,
  date: dateStringSchema,
  note: noteSchema,
});
export type DebtChargeInput = z.infer<typeof debtChargeSchema>;

/** Погашення кредитки переказом з іншого рахунку. */
export const cardPaymentSchema = z.object({
  fromAccountId: idSchema,
  amount: positiveAmountMinorSchema,
  date: dateStringSchema,
});
export type CardPaymentInput = z.infer<typeof cardPaymentSchema>;

/** Звірка: фактичний залишок боргу за даними банку на сьогодні. */
export const debtAdjustmentSchema = z.object({
  actualBalance: nonNegativeAmountSchema,
  note: noteSchema,
});
export type DebtAdjustmentInput = z.infer<typeof debtAdjustmentSchema>;

export const paymentPreviewQuerySchema = z.object({
  amount: z.coerce.number().pipe(positiveAmountMinorSchema),
});

// --- Відповіді ---

export const monthPaymentSchema = z.object({
  dueDate: dateStringSchema,
  required: nonNegativeAmountSchema,
  paid: nonNegativeAmountSchema,
  status: paymentStatusSchema,
});

export const debtProjectionSchema = z.object({
  months: z.number().int().nullable(),
  payoffDate: dateStringSchema.nullable(),
  totalInterest: nonNegativeAmountSchema.nullable(),
  paymentCoversInterest: z.boolean(),
  /** Є, якщо за поточного платежу борг не буде погашено до строку. */
  maturityWarning: z.object({ requiredPayment: positiveAmountMinorSchema }).nullable(),
  /** Прогноз кредитки припускає, що нових покупок не буде. */
  assumesNoNewPurchases: z.boolean(),
});
export type DebtProjection = z.infer<typeof debtProjectionSchema>;

export const debtCardSchema = z.object({
  creditLimit: positiveAmountMinorSchema,
  available: amountMinorSchema,
  usage: z.number(),
  overLimitBy: nonNegativeAmountSchema,
  nearLimit: z.boolean(),
});

export const debtSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  type: debtTypeSchema,
  status: debtStatusSchema,
  /** Рахунок-картка; лише для кредитної картки. */
  accountId: idSchema.nullable(),
  currency: currencySchema,
  initialAmount: nonNegativeAmountSchema,
  startDate: dateStringSchema,
  maturityDate: dateStringSchema.nullable(),
  interestRate: z.number(),
  ratePeriod: ratePeriodSchema,
  monthlyPayment: positiveAmountMinorSchema,
  paymentDay: z.number().int(),
  firstPaymentMonth: monthSchema.nullable(),
  earlyRepaymentAllowed: z.boolean(),
  defaultAccountId: idSchema.nullable(),
  /** Поточний залишок боргу. */
  balance: nonNegativeAmountSchema,
  card: debtCardSchema.nullable(),
  /** Платіж за запитаний місяць. */
  month: monthPaymentSchema,
  projection: debtProjectionSchema,
});
export type Debt = z.infer<typeof debtSchema>;

export const debtsSummarySchema = z.object({
  totalBalance: nonNegativeAmountSchema,
  totalMonthlyPayments: nonNegativeAmountSchema,
  weightedAnnualRate: z.number().nullable(),
  dueThisMonth: nonNegativeAmountSchema,
  debtFreeDate: dateStringSchema.nullable(),
  totalCreditAvailable: nonNegativeAmountSchema,
});

export const debtsOverviewSchema = z.object({
  month: monthSchema,
  currency: currencySchema,
  /** Сьогоднішня дата в часовому поясі домогосподарства. */
  today: dateStringSchema,
  summary: debtsSummarySchema,
  debts: z.array(debtSchema),
});
export type DebtsOverview = z.infer<typeof debtsOverviewSchema>;

export const debtEntrySchema = z.object({
  id: idSchema,
  kind: z.enum(['payment', 'charge', 'adjustment']),
  /** payment і charge — додатна сума; adjustment — знакова різниця звірки. */
  amount: amountMinorSchema,
  principalPart: nonNegativeAmountSchema.nullable(),
  interestPart: nonNegativeAmountSchema.nullable(),
  /** Рахунок, з якого внесено платіж. */
  accountId: idSchema.nullable(),
  date: dateStringSchema,
  note: z.string().nullable(),
});
export type DebtEntry = z.infer<typeof debtEntrySchema>;

/** Деталі боргу: позика має записи боргу, кредитка — транзакції рахунку-картки. */
export const debtDetailsSchema = debtSchema.extend({
  month: monthPaymentSchema,
  viewedMonth: monthSchema,
  today: dateStringSchema,
  entries: z.array(debtEntrySchema),
  transactions: z.array(transactionSchema),
});
export type DebtDetails = z.infer<typeof debtDetailsSchema>;

export const paymentPreviewSchema = z.object({
  amount: positiveAmountMinorSchema,
  principalPart: nonNegativeAmountSchema,
  interestPart: nonNegativeAmountSchema,
  /** Разом із цим платежем за місяць буде сплачено більше, ніж потрібно. */
  isEarly: z.boolean(),
  /** Достроковий платіж суперечить умовам боргу й потребує підтвердження. */
  requiresConfirmation: z.boolean(),
  balanceAfter: nonNegativeAmountSchema,
  projection: debtProjectionSchema,
  /** Скільки відсотків заощаджує цей платіж порівняно з поточним прогнозом; null, якщо невідомо. */
  interestSaved: amountMinorSchema.nullable(),
});
export type PaymentPreview = z.infer<typeof paymentPreviewSchema>;
