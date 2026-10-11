import { formatMoney, type BudgetView } from '@hf/shared';
import { Link } from 'react-router-dom';
import { Button } from '../../shared/ui/button.tsx';

/**
 * Доходи місяця в бюджеті: план — сума очікуваних надходжень, факт — усе отримане за місяць.
 * Самі доходи ведуться на сторінці «Доходи».
 */
export function IncomeSection({ budget }: { budget: BudgetView }) {
  const { summary, currency } = budget;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Доходи</h2>
        <Button variant="outline" asChild>
          <Link to={`/incomes?month=${budget.month}`}>Перейти до доходів</Link>
        </Button>
      </div>
      <dl
        className="grid grid-cols-2 gap-4 rounded-lg border p-3 text-sm"
        data-testid="budget-income"
      >
        <div>
          <dt className="text-muted-foreground">Заплановано</dt>
          <dd className="font-medium tabular-nums">{money(summary.plannedIncomeTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Отримано</dt>
          <dd className="font-medium tabular-nums">{money(summary.receivedIncomeTotal)}</dd>
        </div>
      </dl>
    </section>
  );
}
