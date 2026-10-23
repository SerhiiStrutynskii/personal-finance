import { formatMoney, type BudgetView } from '@hf/shared';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Figure } from '../../shared/ui/figure.tsx';
import { PlanSummary } from './PlanSummary.tsx';

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
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
          <Figure
            compact
            title="Прибутки"
            value={money(summary.receivedIncomeTotal)}
            hint={`план ${money(summary.plannedIncomeTotal)}`}
          />
          <Figure
            compact
            title="Витрати"
            value={money(summary.spentTotal)}
            hint={`план ${money(summary.plannedExpenseTotal)}`}
          />
          <Figure
            title="Залишок"
            value={money(summary.actualBalance)}
            hint={`план ${money(summary.plannedBalance)}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
