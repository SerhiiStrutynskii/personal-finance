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

/** Фактичні витрати однієї категорії за період; categoryId = null — витрати без категорії. */
export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  spent: number;
  /** Батьківська категорія, якщо це підкатегорія: її витрати входять і в ліміт групи. */
  parentId?: string | null | undefined;
}

export interface BudgetFacts {
  spending: readonly CategorySpending[];
  /** Усі доходи з датою в періоді. */
  receivedIncome: number;
}

export interface ExpenseLineResult extends PlannedExpenseLine {
  spent: number;
  /** Може бути від'ємним, якщо ліміт перевищено. */
  remaining: number;
  usage: number | null;
  status: CategoryStatus;
}

export interface UnplannedExpense {
  categoryId: string | null;
  categoryName: string;
  spent: number;
  status: CategoryStatus;
}

/** Чи сходиться план місяця: заплановані витрати не більші за заплановані доходи. */
export type PlanState = 'balanced' | 'deficit';

export function getPlanState(plannedIncome: number, plannedExpenses: number): PlanState {
  return plannedExpenses > plannedIncome ? 'deficit' : 'balanced';
}

export interface BudgetSummary {
  plannedIncomeTotal: number;
  receivedIncomeTotal: number;
  plannedExpenseTotal: number;
  spentTotal: number;
  plannedBalance: number;
  actualBalance: number;
  planState: PlanState;
}

export interface BudgetCalculation {
  summary: BudgetSummary;
  expenseLines: ExpenseLineResult[];
  /** Категорії з витратами, на які немає запланованої статті. */
  unplannedExpenses: UnplannedExpense[];
}

export interface BudgetCalculationInput extends BudgetFacts {
  expenseLines: readonly PlannedExpenseLine[];
  /** Запланований дохід місяця: сума очікуваних надходжень (див. розрахунки доходів). */
  plannedIncome: number;
  now: Date;
  periodEnd: Date;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function calculateBudget({
  expenseLines,
  plannedIncome,
  spending,
  receivedIncome,
  now,
  periodEnd,
}: BudgetCalculationInput): BudgetCalculation {
  const plannedCategoryIds = new Set(expenseLines.map((line) => line.categoryId));
  /**
   * Рядок бюджету, куди йде витрата: ліміт самої категорії, а якщо його немає — ліміт її групи.
   * Ліміт і на групі, і на її підкатегорії бекенд не допускає, тож витрата рахується один раз.
   */
  const lineCategoryOf = (item: CategorySpending): string | null => {
    if (item.categoryId !== null && plannedCategoryIds.has(item.categoryId)) return item.categoryId;
    if (item.parentId && plannedCategoryIds.has(item.parentId)) return item.parentId;
    return null;
  };
  const spentByLine = new Map<string, number>();
  for (const item of spending) {
    const lineCategory = lineCategoryOf(item);
    if (lineCategory)
      spentByLine.set(lineCategory, (spentByLine.get(lineCategory) ?? 0) + item.spent);
  }

  const expenseResults = expenseLines.map((line): ExpenseLineResult => {
    const spent = spentByLine.get(line.categoryId) ?? 0;
    return {
      ...line,
      spent,
      remaining: line.planned - spent,
      usage: getUsage(line.planned, spent),
      status: getCategoryStatus(line.planned, spent, now, periodEnd),
    };
  });

  const unplannedExpenses = spending
    .filter((item) => item.spent > 0 && lineCategoryOf(item) === null)
    .map((item): UnplannedExpense => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      spent: item.spent,
      status: getCategoryStatus(0, item.spent, now, periodEnd),
    }));

  const plannedExpenseTotal = sum(expenseLines.map((line) => line.planned));
  const spentTotal = sum(spending.map((item) => item.spent));

  return {
    summary: {
      plannedIncomeTotal: plannedIncome,
      receivedIncomeTotal: receivedIncome,
      plannedExpenseTotal,
      spentTotal,
      plannedBalance: plannedIncome - plannedExpenseTotal,
      actualBalance: receivedIncome - spentTotal,
      planState: getPlanState(plannedIncome, plannedExpenseTotal),
    },
    expenseLines: expenseResults,
    unplannedExpenses,
  };
}

/** Мінімум полів транзакції, потрібний для бюджету. */
export interface BudgetTransaction {
  type: 'income' | 'expense' | 'transfer' | 'debt_payment' | 'balance_adjustment';
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  categoryId: string | null;
  categoryName?: string | null;
  /** Батьківська категорія категорії транзакції, якщо це підкатегорія. */
  categoryParentId?: string | null;
}

export const UNCATEGORIZED_NAME = 'Без категорії';

/**
 * Зводить транзакції до фактів бюджету: витрати по категоріях і суму доходів за період
 * [start, end) у валюті бюджету. Перекази не враховуються. Бекенд робить те саме одним
 * SQL-запитом; ця функція — еталон правил відбору.
 */
export function summarizeTransactions(
  transactions: readonly BudgetTransaction[],
  period: Period,
  currency: string,
): BudgetFacts {
  const spending = new Map<string | null, CategorySpending>();
  let receivedIncome = 0;

  for (const transaction of transactions) {
    if (transaction.currency !== currency || !isInPeriod(transaction.occurredAt, period)) continue;

    // Платіж по позиці — теж витрата (категорія «Погашення боргів»); переказ і службова зміна
    // балансу — ні, тому погашення кредитки переказом не подвоює вже враховані покупки.
    if (transaction.type === 'expense' || transaction.type === 'debt_payment') {
      const entry = spending.get(transaction.categoryId) ?? {
        categoryId: transaction.categoryId,
        categoryName: transaction.categoryName ?? UNCATEGORIZED_NAME,
        ...(transaction.categoryParentId && { parentId: transaction.categoryParentId }),
        spent: 0,
      };
      entry.spent += transaction.amountMinor;
      spending.set(transaction.categoryId, entry);
    } else if (transaction.type === 'income') {
      receivedIncome += transaction.amountMinor;
    }
  }
  return { spending: [...spending.values()], receivedIncome };
}
