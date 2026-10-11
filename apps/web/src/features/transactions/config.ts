export type EntryType = 'expense' | 'income';

export const ENTRY_CONFIG: Record<
  EntryType,
  {
    path: string;
    title: string;
    addTitle: string;
    addDescription: string;
    editTitle: string;
    editDescription: string;
    empty: string;
  }
> = {
  expense: {
    path: '/expenses',
    title: 'Витрати',
    addTitle: 'Нова витрата',
    addDescription: 'Сума спишеться з обраного рахунку.',
    editTitle: 'Редагування витрати',
    editDescription: 'Зміни замінять поточний запис про витрату.',
    empty: 'Витрат ще немає',
  },
  income: {
    path: '/incomes',
    title: 'Доходи',
    addTitle: 'Новий дохід',
    addDescription: 'Сума зарахується на обраний рахунок.',
    editTitle: 'Редагування доходу',
    editDescription: 'Зміни замінять поточний запис про дохід.',
    empty: 'Доходів ще немає',
  },
};
