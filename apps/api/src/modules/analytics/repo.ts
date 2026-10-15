import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { debtEntries, debts, transactions } from '../../db/schema.ts';

const num = (value: string | number | null | undefined) => Number(value ?? 0);

/** Зміна суми балансів рахунків: прибутки й службові зміни додаються, витрати й платежі віднімаються. */
const accountsDelta = sql`
  coalesce(sum(CASE
    WHEN t.type IN ('income', 'balance_adjustment') THEN t.amount_minor
    WHEN t.type IN ('expense', 'debt_payment') THEN -t.amount_minor
    ELSE 0 END), 0)`;

export interface MonthFactsRow {
  month: string;
  income: number;
  expenses: number;
  debtPayments: number;
  accountsDelta: number;
}

/**
 * Прибутки, витрати, платежі по боргах і зміна балансів рахунків по місяцях у [start, end)
 * одним запитом. Місяць визначається в часовому поясі домогосподарства.
 */
export async function monthlyFacts(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
  timeZone: string,
  currency: string,
): Promise<MonthFactsRow[]> {
  const result = await db.execute<Record<string, string | null>>(sql`
    SELECT to_char(t.occurred_at AT TIME ZONE ${timeZone}, 'YYYY-MM') AS month,
      sum(t.amount_minor) FILTER (WHERE t.type = 'income') AS income,
      sum(t.amount_minor) FILTER (WHERE t.type IN ('expense', 'debt_payment')) AS expenses,
      sum(t.amount_minor) FILTER (
        WHERE t.type = 'debt_payment' OR (t.type = 'transfer' AND card.id IS NOT NULL)
      ) AS debt_payments,
      ${accountsDelta} AS accounts_delta
    FROM ${transactions} t
    LEFT JOIN ${debts} card ON card.account_id = t.to_account_id
    WHERE t.household_id = ${householdId}
      AND t.currency = ${currency}
      AND t.occurred_at >= ${period.start} AND t.occurred_at < ${period.end}
    GROUP BY 1
  `);
  return result.rows.map((row) => ({
    month: row.month!,
    income: num(row.income),
    expenses: num(row.expenses),
    debtPayments: num(row.debt_payments),
    accountsDelta: num(row.accounts_delta),
  }));
}

/** Сума балансів рахунків у валюті на момент `before`; перекази між рахунками її не змінюють. */
export async function accountsTotalBefore(
  db: DbOrTx,
  householdId: string,
  before: Date,
  currency: string,
): Promise<number> {
  const result = await db.execute<{ total: string }>(sql`
    SELECT ${accountsDelta} AS total
    FROM ${transactions} t
    WHERE t.household_id = ${householdId} AND t.currency = ${currency} AND t.occurred_at < ${before}
  `);
  return num(result.rows[0]?.total);
}

export interface LoanMovementRow {
  debtId: string;
  /** Місяць руху або null для рухів до початку динаміки. */
  month: string | null;
  charges: number;
  principalPaid: number;
  adjustments: number;
}

/** Рухи позик і розстрочок до `end`, згруповані за боргом і місяцем; усе до `start` — разом. */
export async function loanMovements(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
  timeZone: string,
): Promise<LoanMovementRow[]> {
  const result = await db.execute<Record<string, string | null>>(sql`
    SELECT debt_id,
      CASE WHEN occurred_at < ${period.start} THEN NULL
           ELSE to_char(occurred_at AT TIME ZONE ${timeZone}, 'YYYY-MM') END AS month,
      sum(amount) FILTER (WHERE kind = 'charge') AS charges,
      sum(principal_part) FILTER (WHERE kind = 'payment') AS principal_paid,
      sum(amount) FILTER (WHERE kind = 'adjustment') AS adjustments
    FROM ${debtEntries}
    WHERE household_id = ${householdId} AND occurred_at < ${period.end}
    GROUP BY 1, 2
  `);
  return result.rows.map((row) => ({
    debtId: row.debt_id!,
    month: row.month ?? null,
    charges: num(row.charges),
    principalPaid: num(row.principal_paid),
    adjustments: num(row.adjustments),
  }));
}
