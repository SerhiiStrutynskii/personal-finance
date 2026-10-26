import {
  Calculator,
  ChartArea,
  CreditCard,
  HandCoins,
  Home,
  Tags,
  Target,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  title: string;
  icon: LucideIcon;
  route: string;
}

export const navItems: NavItem[] = [
  { title: 'Головна', icon: Home, route: '/' },
  { title: 'Витрати', icon: HandCoins, route: '/expenses' },
  { title: 'Прибутки', icon: TrendingUp, route: '/incomes' },
  { title: 'Рахунки', icon: CreditCard, route: '/accounts' },
  { title: 'Категорії', icon: Tags, route: '/categories' },
  { title: 'Бюджет', icon: Calculator, route: '/budget' },
  { title: 'Борги', icon: Wallet, route: '/debts' },
  { title: 'Цілі', icon: Target, route: '/goals' },
  { title: 'Меню', icon: UtensilsCrossed, route: '/menu' },
  { title: 'Аналітика', icon: ChartArea, route: '/analytics' },
  { title: 'Домогосподарство', icon: Users, route: '/household' },
];

/** Розділ меню, до якого належить сторінка: `/menu/lists/42` → «Меню». */
export function currentNavItem(pathname: string): NavItem | undefined {
  return navItems.find((item) =>
    item.route === '/'
      ? pathname === '/'
      : pathname === item.route || pathname.startsWith(`${item.route}/`),
  );
}
