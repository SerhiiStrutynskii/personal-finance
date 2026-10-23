import { formatMoney, type IncomesView } from '@hf/shared';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Figure } from '../../shared/ui/figure.tsx';
import { Progress } from '../../shared/ui/progress.tsx';

export function IncomeSummary({ incomes }: { incomes: IncomesView }) {
  const { summary, currency } = incomes;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const progress =
    summary.plannedTotal > 0
      ? Math.min(100, (summary.receivedTotal / summary.plannedTotal) * 100)
      : summary.receivedTotal > 0
        ? 100
        : 0;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
          <Figure compact title="Заплановано" value={money(summary.plannedTotal)} />
          <Figure compact title="Отримано" value={money(summary.receivedTotal)} />
          <Figure title="Ще очікується" value={money(summary.expectedRemaining)} />
        </div>
        <Progress
          className="h-1.5"
          value={progress}
          aria-label="Отримано від запланованого"
          data-testid="income-progress"
        />
        <p className="text-sm text-muted-foreground">
          Регулярні: {money(summary.receivedRecurring)} · разові: {money(summary.oneTimeTotal)}.
          «Отримано» рахується за датою, коли гроші надійшли: зарплата за цей місяць, що прийшла
          наступного, позначить надходження отриманим тут, а сума потрапить у наступний місяць.
        </p>
      </CardContent>
    </Card>
  );
}
