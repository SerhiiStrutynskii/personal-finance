export type EntryType = 'expense' | 'income';

export const ENTRY_CONFIG: Record<
  EntryType,
  { path: string; title: string; addTitle: string; editTitle: string; empty: string }
> = {
  expense: {
    path: '/expenses',
    title: 'Витрати',
    addTitle: 'Нова витрата',
    editTitle: 'Редагування витрати',
    empty: 'Витрат ще немає',
  },
  income: {
    path: '/incomes',
    title: 'Доходи',
    addTitle: 'Новий дохід',
    editTitle: 'Редагування доходу',
    empty: 'Доходів ще немає',
  },
};
