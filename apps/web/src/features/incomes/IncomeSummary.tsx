import { formatMoney, type IncomesView } from '@hf/shared';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Progress } from '../../shared/ui/progress.tsx';

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Figure title="Заплановано" value={money(summary.plannedTotal)} />
          <Figure title="Отримано" value={money(summary.receivedTotal)} />
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
