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
    empty: 'За цей місяць витрат немає',
  },
  income: {
    path: '/incomes',
    title: 'Прибутки',
    addTitle: 'Новий прибуток',
    addDescription: 'Сума зарахується на обраний рахунок.',
    editTitle: 'Редагування прибутку',
    editDescription: 'Зміни замінять поточний запис про прибуток.',
    empty: 'За цей місяць прибутків немає',
  },
};
