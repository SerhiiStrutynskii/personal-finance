import { formatMoney, type BudgetView } from '@hf/shared';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { PlanSummary } from './PlanSummary.tsx';

function Figure({ title, planned, actual }: { title: string; planned: string; actual: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{actual}</div>
      <div className="text-sm text-muted-foreground tabular-nums">план {planned}</div>
    </div>
  );
}

export function BudgetSummary({ budget }: { budget: BudgetView }) {
  const { summary, currency } = budget;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <div className="space-y-3">
      <PlanSummary
        plannedIncome={summary.plannedIncomeTotal}
        plannedExpenses={summary.plannedExpenseTotal}
        state={summary.planState}
        currency={currency}
      />
      <Card data-testid="budget-summary">
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Figure
            title="Доходи"
            actual={money(summary.receivedIncomeTotal)}
            planned={money(summary.plannedIncomeTotal)}
          />
          <Figure
            title="Витрати"
            actual={money(summary.spentTotal)}
            planned={money(summary.plannedExpenseTotal)}
          />
          <Figure
            title="Залишок"
            actual={money(summary.actualBalance)}
            planned={money(summary.plannedBalance)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
