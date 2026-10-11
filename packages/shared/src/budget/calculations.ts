import type { Period } from '../dates.ts';
import { isInPeriod } from '../dates.ts';

// Розрахунки місячного бюджету. Усі суми — цілі числа в мінімальних одиницях валюти (копійки).

/** over — ліміт перевищено; surplus — період завершився із залишком; neutral — решта випадків. */
export type CategoryStatus = 'over' | 'surplus' | 'neutral';

/**
 * Статус категорії витрат. `now` і `periodEnd` — моменти в UTC; кінець періоду виключний,
 * тому рівно в `periodEnd` період уже вважається завершеним.
 */
export function getCategoryStatus(
  planned: number,
  spent: number,
  now: Date,
  periodEnd: Date,
): CategoryStatus {
  if (spent > planned) return 'over';
  if (now.getTime() >= periodEnd.getTime() && spent < planned) return 'surplus';
  return 'neutral';
}

/**
 * Частка використаного ліміту. Без ліміту, але з витратами частка нескінченна — повертається null,
 * бо нескінченність не передається в JSON.
 */
export function getUsage(planned: number, spent: number): number | null {
  if (planned > 0) return spent / planned;
  return spent > 0 ? null : 0;
}

export interface PlannedExpenseLine {
  id: string;
  categoryId: string;
  categoryName: string;
  planned: number;
}

export interface PlannedIncomeLine {
  id: string;
  name: string;
  planned: number;
}

/** Фактичні витрати однієї категорії за період; categoryId = null — витрати без категорії. */
export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  spent: number;
}

/** Фактичні доходи однієї статті за період; incomeLineId = null — доходи без статті. */
export interface LineIncome {
  incomeLineId: string | null;
  received: number;
}

export interface BudgetFacts {
  spending: readonly CategorySpending[];
  income: readonly LineIncome[];
}

export interface ExpenseLineResult extends PlannedExpenseLine {
  spent: number;
  /** Може бути від'ємним, якщо ліміт перевищено. */
  remaining: number;
  usage: number | null;
  status: CategoryStatus;
}

export interface IncomeLineResult extends PlannedIncomeLine {
  received: number;
  diff: number;
}

export interface UnplannedExpense extends CategorySpending {
  status: CategoryStatus;
}

export interface BudgetSummary {
  plannedIncomeTotal: number;
  receivedIncomeTotal: number;
  plannedExpenseTotal: number;
  spentTotal: number;
  plannedBalance: number;
  actualBalance: number;
}

export interface BudgetCalculation {
  summary: BudgetSummary;
  incomeLines: IncomeLineResult[];
  expenseLines: ExpenseLineResult[];
  /** Категорії з витратами, на які немає запланованої статті. */
  unplannedExpenses: UnplannedExpense[];
  /** Доходи, не прив'язані до жодної статті цього бюджету. */
  otherIncome: number;
}

export interface BudgetCalculationInput extends BudgetFacts {
  expenseLines: readonly PlannedExpenseLine[];
  incomeLines: readonly PlannedIncomeLine[];
  now: Date;
  periodEnd: Date;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function calculateBudget({
  expenseLines,
  incomeLines,
  spending,
  income,
  now,
  periodEnd,
}: BudgetCalculationInput): BudgetCalculation {
  const spentByCategory = new Map(spending.map((item) => [item.categoryId, item.spent]));
  const plannedCategoryIds = new Set(expenseLines.map((line) => line.categoryId));

  const expenseResults = expenseLines.map((line): ExpenseLineResult => {
    const spent = spentByCategory.get(line.categoryId) ?? 0;
    return {
      ...line,
      spent,
      remaining: line.planned - spent,
      usage: getUsage(line.planned, spent),
      status: getCategoryStatus(line.planned, spent, now, periodEnd),
    };
  });

  const unplannedExpenses = spending
    .filter((item) => item.spent > 0)
    .filter((item) => item.categoryId === null || !plannedCategoryIds.has(item.categoryId))
    .map((item): UnplannedExpense => ({
      ...item,
      status: getCategoryStatus(0, item.spent, now, periodEnd),
    }));

  const lineIds = new Set(incomeLines.map((line) => line.id));
  const receivedByLine = new Map<string, number>();
  let otherIncome = 0;
  for (const item of income) {
    // Дохід, прив'язаний до статті іншого бюджету, для цього бюджету — «інший».
    if (item.incomeLineId !== null && lineIds.has(item.incomeLineId)) {
      receivedByLine.set(
        item.incomeLineId,
        (receivedByLine.get(item.incomeLineId) ?? 0) + item.received,
      );
    } else {
      otherIncome += item.received;
    }
  }

  const incomeResults = incomeLines.map((line): IncomeLineResult => {
    const received = receivedByLine.get(line.id) ?? 0;
    return { ...line, received, diff: received - line.planned };
  });

  const plannedIncomeTotal = sum(incomeLines.map((line) => line.planned));
  const plannedExpenseTotal = sum(expenseLines.map((line) => line.planned));
  const receivedIncomeTotal = sum(income.map((item) => item.received));
  const spentTotal = sum(spending.map((item) => item.spent));

  return {
    summary: {
      plannedIncomeTotal,
      receivedIncomeTotal,
      plannedExpenseTotal,
      spentTotal,
      plannedBalance: plannedIncomeTotal - plannedExpenseTotal,
      actualBalance: receivedIncomeTotal - spentTotal,
    },
    incomeLines: incomeResults,
    expenseLines: expenseResults,
    unplannedExpenses,
    otherIncome,
  };
}

/** Мінімум полів транзакції, потрібний для бюджету. */
export interface BudgetTransaction {
  type: 'income' | 'expense' | 'transfer';
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  categoryId: string | null;
  categoryName?: string | null;
  incomeLineId?: string | null;
}

export const UNCATEGORIZED_NAME = 'Без категорії';

/**
 * Зводить транзакції до фактів бюджету: витрати по категоріях і доходи по статтях за період
 * [start, end) у валюті бюджету. Перекази не враховуються. Бекенд робить те саме одним
 * SQL-запитом; ця функція — еталон правил відбору.
 */
export function summarizeTransactions(
  transactions: readonly BudgetTransaction[],
  period: Period,
  currency: string,
): BudgetFacts {
  const spending = new Map<string | null, CategorySpending>();
  const income = new Map<string | null, LineIncome>();

  for (const transaction of transactions) {
    if (transaction.currency !== currency || !isInPeriod(transaction.occurredAt, period)) continue;

    if (transaction.type === 'expense') {
      const entry = spending.get(transaction.categoryId) ?? {
        categoryId: transaction.categoryId,
        categoryName: transaction.categoryName ?? UNCATEGORIZED_NAME,
        spent: 0,
      };
      entry.spent += transaction.amountMinor;
      spending.set(transaction.categoryId, entry);
    } else if (transaction.type === 'income') {
      const incomeLineId = transaction.incomeLineId ?? null;
      const entry = income.get(incomeLineId) ?? { incomeLineId, received: 0 };
      entry.received += transaction.amountMinor;
      income.set(incomeLineId, entry);
    }
  }
  return { spending: [...spending.values()], income: [...income.values()] };
}
