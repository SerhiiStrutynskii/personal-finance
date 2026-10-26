// Таби модуля «Меню»: «Планування раціону» (календар і довідники страв і прийомів їжі) та
// «Покупки» (списки покупок, покупки за меню, довідник продуктів).

export type MenuTab = 'planning' | 'shopping';

export const MENU_TABS: readonly { tab: MenuTab; title: string; route: string }[] = [
  { tab: 'planning', title: 'Планування раціону', route: '/menu' },
  { tab: 'shopping', title: 'Покупки', route: '/menu/lists' },
];

const SHOPPING_SECTIONS = ['lists', 'products', 'shopping'];
const PLANNING_SECTIONS = ['dictionaries'];

/**
 * Активний таб за шляхом: `/menu/lists/42` → «Покупки», `/menu/dictionaries` → «Планування
 * раціону». Для сторінок поза модулем «Меню» (і друку) — undefined.
 */
export function menuTab(pathname: string): MenuTab | undefined {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'menu') return undefined;
  const section = parts[1];
  if (section === undefined) return 'planning';
  if (PLANNING_SECTIONS.includes(section)) return 'planning';
  if (SHOPPING_SECTIONS.includes(section)) return 'shopping';
  return undefined;
}

/** Нова адреса для старих посилань `/shopping…`; query і хеш переносяться. */
export function legacyShoppingPath(pathname: string, search = '', hash = ''): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'shopping' || parts.length > 3) return undefined;
  const [, id, rest] = parts;
  let target: string | undefined;
  if (id === undefined) target = '/menu/lists';
  else if (id === 'products' && rest === undefined) target = '/menu/products';
  else if (rest === undefined) target = `/menu/lists/${id}`;
  else if (rest === 'print') target = `/menu/lists/${id}/print`;
  return target && `${target}${search}${hash}`;
}
