import { formatMoney, type DebtsOverview } from '@hf/shared';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { formatDateString } from '../../shared/ui/format.ts';

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function DebtsSummary({ overview }: { overview: DebtsOverview }) {
  const { summary, currency } = overview;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const rate =
    summary.weightedAnnualRate === null
      ? '—'
      : `${String(summary.weightedAnnualRate).replace('.', ',')}% річних`;

  return (
    <Card data-testid="debts-summary">
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure title="Загальний борг" value={money(summary.totalBalance)} />
        <Figure title="Щомісячні платежі" value={money(summary.totalMonthlyPayments)} />
        <Figure title="Середня ставка" value={rate} />
        <Figure title="До сплати цього місяця" value={money(summary.dueThisMonth)} />
        <Figure
          title="Вихід із боргів"
          value={summary.debtFreeDate ? formatDateString(summary.debtFreeDate) : '—'}
        />
        <Figure title="Доступний кредитний ліміт" value={money(summary.totalCreditAvailable)} />
      </CardContent>
    </Card>
  );
}
