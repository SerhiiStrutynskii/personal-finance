// Розрахунки аналітики. Усі суми — цілі числа в мінімальних одиницях валюти (копійки);
// частки й норми — відношення, а не суми.
import { GROUP_OWN_SPENDING } from '../budget/calculations.ts';
import { shiftMonth } from '../budget/month.ts';
import type { DateString } from '../incomes/recurrence.ts';

/** Витрати однієї категорії за місяць; categoryId = null — витрати без категорії. */
export interface CategoryAmount {
  categoryId: string | null;
  categoryName: string;
  spent: number;
  /** Група підкатегорії: її витрати показуються в рядку групи. */
  parentId?: string | null | undefined;
  parentName?: string | null | undefined;
}

interface BreakdownRow {
  categoryId: string | null;
  categoryName: string;
  spent: number;
  /** Частка у витратах місяця: 0,4245 — це 42,45%. */
  share: number;
  previousSpent: number;
  /** Зміна відносно попереднього місяця; від'ємна — витрачено менше. */
  change: number;
}

export interface CategoryBreakdownRow extends BreakdownRow {
  /**
   * Розбивка групи за підкатегоріями; лише для груп, у яких були витрати підкатегорій. Частки —
   * від усіх витрат місяця. Витрати на саму групу йдуть рядком «Без підкатегорії».
   */
  subcategories?: BreakdownRow[];
}

export interface CategoryBreakdown {
  totalSpent: number;
  previousTotalSpent: number;
  change: number;
  categories: CategoryBreakdownRow[];
}

type Amount = Pick<CategoryAmount, 'categoryId' | 'categoryName' | 'spent'>;

/** Рядки з порівнянням, без нулів в обох місяцях, від більших витрат до менших. */
function compareMonths(
  current: readonly Amount[],
  previous: readonly Amount[],
  totalSpent: number,
): BreakdownRow[] {
  const previousById = new Map(previous.map((row) => [row.categoryId, row]));
  const currentIds = new Set(current.map((row) => row.categoryId));

  return [
    ...current,
    ...previous
      .filter((row) => !currentIds.has(row.categoryId))
      .map((row) => ({ ...row, spent: 0 })),
  ]
    .map((row) => {
      const previousSpent = previousById.get(row.categoryId)?.spent ?? 0;
      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        spent: row.spent,
        share: totalSpent > 0 ? row.spent / totalSpent : 0,
        previousSpent,
        change: row.spent - previousSpent,
      };
    })
    .filter((row) => row.spent > 0 || row.previousSpent > 0)
    .sort(
      (a, b) =>
        b.spent - a.spent ||
        b.previousSpent - a.previousSpent ||
        a.categoryName.localeCompare(b.categoryName, 'uk'),
    );
}

const groupIdOf = (row: CategoryAmount) => row.parentId ?? row.categoryId;

/** Сумує витрати підкатегорій у рядки їхніх груп. */
function rollUpToGroups(rows: readonly CategoryAmount[]): Amount[] {
  const groups = new Map<string | null, Amount>();
  for (const row of rows) {
    const id = groupIdOf(row);
    const group = groups.get(id) ?? {
      categoryId: id,
      categoryName: row.parentId ? (row.parentName ?? row.categoryName) : row.categoryName,
      spent: 0,
    };
    group.spent += row.spent;
    groups.set(id, group);
  }
  return [...groups.values()];
}

/**
 * Розподіл витрат місяця за категоріями з порівнянням із попереднім місяцем.
 * До списку входять і категорії, що мали витрати лише в попередньому місяці. Підкатегорії
 * згортаються в рядок своєї групи, а їхня розбивка — у `subcategories` цього рядка.
 */
export function breakdownByCategory(
  current: readonly CategoryAmount[],
  previous: readonly CategoryAmount[],
): CategoryBreakdown {
  const totalSpent = current.reduce((sum, row) => sum + row.spent, 0);
  const previousTotalSpent = previous.reduce((sum, row) => sum + row.spent, 0);

  const categories = compareMonths(
    rollUpToGroups(current),
    rollUpToGroups(previous),
    totalSpent,
  ).map((group): CategoryBreakdownRow => {
    const inGroup = (row: CategoryAmount) => groupIdOf(row) === group.categoryId;
    const members = [...current, ...previous].filter(inGroup);
    if (!members.some((row) => row.parentId)) return group;

    const asSubcategory = (row: CategoryAmount): Amount => ({
      categoryId: row.categoryId,
      categoryName: row.parentId ? row.categoryName : GROUP_OWN_SPENDING,
      spent: row.spent,
    });
    const subcategories = compareMonths(
      current.filter(inGroup).map(asSubcategory),
      previous.filter(inGroup).map(asSubcategory),
      totalSpent,
    );
    return { ...group, subcategories };
  });

  return {
    totalSpent,
    previousTotalSpent,
    change: totalSpent - previousTotalSpent,
    categories,
  };
}

/** Частка прибутку, що лишилася після витрат; null без прибутку; від'ємна, якщо витрачено більше. */
export function savingsRate(income: number, expenses: number): number | null {
  return income > 0 ? (income - expenses) / income : null;
}

/** Частка прибутку, що пішла на борги; null без прибутку. */
export function debtLoad(debtPayments: number, income: number): number | null {
  return income > 0 ? debtPayments / income : null;
}

/** Останні `count` місяців, що закінчуються місяцем `month`, від найдавнішого. */
export function monthsEndingAt(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1));
}

/** Скільки днів місяця минуло до `today` включно і скільки днів у місяці. */
export function monthProgress(
  month: string,
  today: DateString,
): { daysElapsed: number; daysInMonth: number } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const currentMonth = today.slice(0, 7);
  const daysElapsed =
    currentMonth > month ? daysInMonth : currentMonth < month ? 0 : Number(today.slice(8, 10));
  return { daysElapsed, daysInMonth };
}

/**
 * Прогноз витрат до кінця місяця за поточним темпом — лінійна екстраполяція.
 * Ділення в цілих числах з округленням до копійки.
 */
export function forecastSpending(spent: number, daysElapsed: number, daysInMonth: number): number {
  if (daysElapsed <= 0) return spent;
  if (daysElapsed >= daysInMonth) return spent;
  return Math.floor((spent * daysInMonth * 2 + daysElapsed) / (daysElapsed * 2));
}

export interface TrendMonthFacts {
  month: string;
  income: number;
  expenses: number;
  /** Платежі по позиках і перекази на рахунки кредиток. */
  debtPayments: number;
  /** Зміна суми балансів рахунків за місяць (перекази між рахунками її не змінюють). */
  accountsDelta: number;
}

export interface LoanMonthMovement {
  month: string;
  charges: number;
  principalPaid: number;
  adjustments: number;
}

/** Позика чи розстрочка з рухами, потрібними для залишку на кінець кожного місяця. */
export interface LoanHistory {
  initialAmount: number;
  startDate: DateString;
  /** Рухи до початку першого місяця динаміки. */
  before: Omit<LoanMonthMovement, 'month'>;
  monthly: readonly LoanMonthMovement[];
}

export interface TrendPoint {
  month: string;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number | null;
  /** Баланси рахунків мінус залишки позик на кінець місяця. */
  netWorth: number;
  debtPayments: number;
  debtLoad: number | null;
}

const EMPTY_FACTS = { income: 0, expenses: 0, debtPayments: 0, accountsDelta: 0 };

/** Залишок позики на кінець місяця; до місяця початку боргу його ще немає. */
function loanBalanceAt(loan: LoanHistory, month: string): number {
  if (loan.startDate.slice(0, 7) > month) return 0;
  let balance =
    loan.initialAmount + loan.before.charges - loan.before.principalPaid + loan.before.adjustments;
  for (const movement of loan.monthly) {
    if (movement.month <= month) {
      balance += movement.charges - movement.principalPaid + movement.adjustments;
    }
  }
  return Math.max(0, balance);
}

/**
 * Динаміка по місяцях. Чисті активи накопичуються від суми балансів рахунків на початок
 * першого місяця; борг кредитки вже є від'ємним балансом її рахунку, тож віднімаються лише позики.
 */
export function buildTrend(input: {
  months: readonly string[];
  facts: readonly TrendMonthFacts[];
  /** Сума балансів рахунків на початок першого місяця. */
  accountsBefore: number;
  loans: readonly LoanHistory[];
}): TrendPoint[] {
  const factsByMonth = new Map(input.facts.map((row) => [row.month, row]));
  let accounts = input.accountsBefore;

  return input.months.map((month) => {
    const { income, expenses, debtPayments, accountsDelta } =
      factsByMonth.get(month) ?? EMPTY_FACTS;
    accounts += accountsDelta;
    const loans = input.loans.reduce((sum, loan) => sum + loanBalanceAt(loan, month), 0);
    return {
      month,
      income,
      expenses,
      net: income - expenses,
      savingsRate: savingsRate(income, expenses),
      netWorth: accounts - loans,
      debtPayments,
      debtLoad: debtLoad(debtPayments, income),
    };
  });
}
