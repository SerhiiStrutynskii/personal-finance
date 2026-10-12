import type { Goal } from '@hf/shared';
import type { PayoffStrategy } from './api.ts';
import type { GoalKind } from './goalForm.ts';

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  savings: 'Накопичення',
  debt_payoff: 'Вихід із боргів',
};

export const STRATEGIES: PayoffStrategy[] = ['avalanche', 'snowball'];

export const STRATEGY_LABELS: Record<PayoffStrategy, string> = {
  avalanche: 'Лавина — спершу найвища ставка',
  snowball: 'Сніжна куля — спершу найменший борг',
};

/** Оформлення картки за станом цілі, який порахував бекенд. */
export const GOAL_CARD_CLASS: Record<Goal['state'], string> = {
  achieved: 'border-status-surplus bg-status-surplus/10',
  on_track: 'border-status-surplus',
  behind: 'border-status-partial bg-status-partial/10',
  overdue: 'border-status-over bg-status-over/10',
  no_deadline: 'border-border',
};
