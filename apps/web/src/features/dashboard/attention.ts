import type { Dashboard } from '@hf/shared';
import {
  AlarmClock,
  CircleAlert,
  CircleDashed,
  TrendingDown,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

export type AttentionItem = Dashboard['attention'][number];
type AttentionKind = AttentionItem['kind'];

/** Як показати кожен вид попередження: текст, іконка, чи це високий пріоритет і куди веде. */
export const ATTENTION_VIEW: Record<
  AttentionKind,
  { label: string; icon: LucideIcon; urgent: boolean; link: (item: AttentionItem) => string }
> = {
  debt_overdue: {
    label: 'Прострочено платіж',
    icon: CircleAlert,
    urgent: true,
    link: (item) => `/debts/${item.id}`,
  },
  income_overdue: {
    label: 'Не надійшов прибуток',
    icon: CircleAlert,
    urgent: true,
    link: () => '/incomes',
  },
  budget_over: {
    label: 'Перевищено ліміт',
    icon: TriangleAlert,
    urgent: true,
    link: () => '/budget',
  },
  goal_overdue: {
    label: 'Строк цілі минув',
    icon: CircleAlert,
    urgent: true,
    link: () => '/goals',
  },
  debt_due_soon: {
    label: 'Платіж скоро',
    icon: AlarmClock,
    urgent: false,
    link: (item) => `/debts/${item.id}`,
  },
  goal_behind: {
    label: 'Ціль відстає',
    icon: CircleDashed,
    urgent: false,
    link: () => '/goals',
  },
};

export const UPCOMING_VIEW = {
  debt_payment: {
    label: 'Платіж по боргу',
    icon: TrendingDown,
    link: (id: string) => `/debts/${id}`,
  },
  income: { label: 'Очікуваний прибуток', icon: CircleDashed, link: () => '/incomes' },
} as const;
