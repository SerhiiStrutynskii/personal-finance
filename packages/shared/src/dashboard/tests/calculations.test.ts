import { describe, expect, it } from 'vitest';
import {
  buildAttention,
  buildUpcoming,
  netWorthOf,
  type DashboardDebt,
  type DashboardGoal,
  type DashboardOccurrence,
} from '../calculations.ts';

const TODAY = '2026-10-12';

const debt = (
  name: string,
  override: Partial<DashboardDebt['month']> = {},
  status: DashboardDebt['status'] = 'active',
): DashboardDebt => ({
  id: `debt-${name}`,
  name,
  status,
  month: { dueDate: '2026-10-20', required: 10_000, paid: 0, status: 'pending', ...override },
});

const occurrence = (
  name: string,
  override: Partial<DashboardOccurrence> = {},
): DashboardOccurrence => ({
  id: `occ-${name}`,
  name,
  plannedDate: '2026-10-15',
  plannedAmount: 50_000,
  actualAmount: 0,
  status: 'pending',
  ...override,
});

const goal = (name: string, override: Partial<DashboardGoal> = {}): DashboardGoal => ({
  id: `goal-${name}`,
  name,
  status: 'active',
  state: 'on_track',
  targetDate: '2027-06-30',
  requiredMonthly: 20_000,
  ...override,
});

const nothing = { debts: [], occurrences: [], overspent: [], goals: [] };

describe('buildAttention', () => {
  it('порожній список, коли все гаразд', () => {
    expect(buildAttention(nothing)).toEqual([]);
    expect(
      buildAttention({
        debts: [
          debt('A'),
          debt('B', { status: 'paid', paid: 10_000 }),
          debt('C', { status: 'none', required: 0 }),
        ],
        occurrences: [occurrence('Зарплата'), occurrence('Аванс', { status: 'received' })],
        overspent: [],
        goals: [
          goal('Подушка'),
          goal('Відпустка', { state: 'no_deadline' }),
          goal('Ремонт', { state: 'achieved' }),
        ],
      }),
    ).toEqual([]);
  });

  it('кожен вид попередження зі своєю сумою й датою', () => {
    const items = buildAttention({
      debts: [
        debt('Позика', { status: 'overdue', dueDate: '2026-10-05', paid: 4_000 }),
        debt('Кредитка', { status: 'due_soon', dueDate: '2026-10-14' }),
      ],
      occurrences: [
        occurrence('Зарплата', { status: 'overdue', plannedDate: '2026-10-05', actualAmount: 0 }),
      ],
      overspent: [{ categoryId: 'food', categoryName: 'Продукти', overBy: 15_000 }],
      goals: [
        goal('Відпустка', { state: 'overdue', targetDate: '2026-09-30' }),
        goal('Подушка', { state: 'behind' }),
      ],
    });
    expect(items).toEqual([
      {
        kind: 'debt_overdue',
        id: 'debt-Позика',
        name: 'Позика',
        amount: 6_000,
        date: '2026-10-05',
      },
      {
        kind: 'income_overdue',
        id: 'occ-Зарплата',
        name: 'Зарплата',
        amount: 50_000,
        date: '2026-10-05',
      },
      { kind: 'budget_over', id: 'food', name: 'Продукти', amount: 15_000, date: null },
      {
        kind: 'goal_overdue',
        id: 'goal-Відпустка',
        name: 'Відпустка',
        amount: null,
        date: '2026-09-30',
      },
      {
        kind: 'debt_due_soon',
        id: 'debt-Кредитка',
        name: 'Кредитка',
        amount: 10_000,
        date: '2026-10-14',
      },
      {
        kind: 'goal_behind',
        id: 'goal-Подушка',
        name: 'Подушка',
        amount: 20_000,
        date: '2027-06-30',
      },
    ]);
  });

  it('у межах виду: раніша дата першою; без дати — більша сума першою', () => {
    const items = buildAttention({
      ...nothing,
      debts: [
        debt('Пізній', { status: 'overdue', dueDate: '2026-10-10' }),
        debt('Ранній', { status: 'overdue', dueDate: '2026-10-03' }),
      ],
      overspent: [
        { categoryId: 'a', categoryName: 'Мала', overBy: 100 },
        { categoryId: null, categoryName: 'Без категорії', overBy: 900 },
      ],
    });
    expect(items.map((item) => item.name)).toEqual(['Ранній', 'Пізній', 'Без категорії', 'Мала']);
    expect(items[2]).toMatchObject({ kind: 'budget_over', id: null });
  });

  it('закриті борги й архівні цілі не потрапляють', () => {
    const items = buildAttention({
      ...nothing,
      debts: [debt('Закритий', { status: 'overdue' }, 'closed')],
      goals: [goal('Архів', { status: 'archived', state: 'overdue' })],
    });
    expect(items).toEqual([]);
  });

  it('ціль, яку не встигнути жодним платежем, — без суми', () => {
    const [item] = buildAttention({
      ...nothing,
      goals: [goal('Борги', { state: 'behind', requiredMonthly: null })],
    });
    expect(item).toMatchObject({ kind: 'goal_behind', amount: null });
  });

  it('частково отриманий дохід не є простроченим', () => {
    const items = buildAttention({
      ...nothing,
      occurrences: [
        occurrence('Аванс', { status: 'partial', plannedDate: '2026-10-01', actualAmount: 100 }),
      ],
    });
    expect(items).toEqual([]);
  });
});

describe('buildUpcoming', () => {
  const upcoming = (input: { debts?: DashboardDebt[]; occurrences?: DashboardOccurrence[] }) =>
    buildUpcoming({ debts: [], occurrences: [], today: TODAY, ...input });

  it('платежі й надходження за датою, потім за назвою', () => {
    const items = upcoming({
      debts: [
        debt('Кредитка', { dueDate: '2026-10-25' }),
        debt('Позика', { dueDate: '2026-10-15' }),
      ],
      occurrences: [occurrence('Аванс'), occurrence('Оренда', { plannedDate: '2026-10-12' })],
    });
    expect(items).toEqual([
      { kind: 'income', id: 'occ-Оренда', name: 'Оренда', amount: 50_000, date: '2026-10-12' },
      { kind: 'income', id: 'occ-Аванс', name: 'Аванс', amount: 50_000, date: '2026-10-15' },
      {
        kind: 'debt_payment',
        id: 'debt-Позика',
        name: 'Позика',
        amount: 10_000,
        date: '2026-10-15',
      },
      {
        kind: 'debt_payment',
        id: 'debt-Кредитка',
        name: 'Кредитка',
        amount: 10_000,
        date: '2026-10-25',
      },
    ]);
  });

  it('часткове — із залишком суми', () => {
    const items = upcoming({
      debts: [debt('Позика', { status: 'partial', paid: 4_000 })],
      occurrences: [occurrence('Аванс', { status: 'partial', actualAmount: 20_000 })],
    });
    expect(items.map((item) => item.amount)).toEqual([30_000, 6_000]);
  });

  it('сплачене, отримане, пропущене й прострочене не потрапляють', () => {
    const items = upcoming({
      debts: [
        debt('Сплачений', { status: 'paid', paid: 10_000 }),
        debt('Прострочений', { status: 'overdue', dueDate: '2026-10-05' }),
        debt('Нічого', { status: 'none', required: 0 }),
        debt('Закритий', {}, 'closed'),
      ],
      occurrences: [
        occurrence('Отримано', { status: 'received' }),
        occurrence('Пропущено', { status: 'skipped' }),
        occurrence('Не надійшло', { status: 'overdue', plannedDate: '2026-10-05' }),
      ],
    });
    expect(items).toEqual([]);
  });

  it('лише від сьогодні до кінця поточного місяця', () => {
    const items = upcoming({
      debts: [
        debt('Листопад', { dueDate: '2026-11-01' }),
        debt('Останній день', { dueDate: '2026-10-31' }),
      ],
      occurrences: [
        occurrence('Вчора частково', {
          status: 'partial',
          plannedDate: '2026-10-11',
          actualAmount: 1,
        }),
        occurrence('Сьогодні', { plannedDate: TODAY }),
      ],
    });
    expect(items.map((item) => item.name)).toEqual(['Сьогодні', 'Останній день']);
  });
});

describe('netWorthOf', () => {
  it('рахунки мінус залишки позик', () => {
    expect(netWorthOf(1_000_000, [300_000, 50_000])).toBe(650_000);
    expect(netWorthOf(-20_000, [])).toBe(-20_000);
    expect(netWorthOf(100, [500])).toBe(-400);
  });
});
