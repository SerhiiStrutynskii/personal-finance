import { formatMoney, type BudgetView } from '@hf/shared';
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '../../shared/ui/alert.tsx';
import { Card, CardContent } from '../../shared/ui/card.tsx';

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
  const shortfall = summary.plannedExpenseTotal - summary.plannedIncomeTotal;

  return (
    <div className="space-y-3">
      <Card>
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
      {shortfall > 0 && (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertDescription>
            Заплановані витрати перевищують заплановані доходи на {money(shortfall)}.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
