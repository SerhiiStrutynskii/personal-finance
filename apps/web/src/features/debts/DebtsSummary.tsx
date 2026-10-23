import { formatMoney, type DebtsOverview } from '@hf/shared';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Figure } from '../../shared/ui/figure.tsx';
import { formatDateString } from '../../shared/ui/format.ts';

export function DebtsSummary({ overview }: { overview: DebtsOverview }) {
  const { summary, currency } = overview;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const rate =
    summary.weightedAnnualRate === null
      ? '—'
      : `${String(summary.weightedAnnualRate).replace('.', ',')}% річних`;

  return (
    <Card data-testid="debts-summary">
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
        <Figure title="Загальний борг" value={money(summary.totalBalance)} />
        <Figure compact title="Щомісячні платежі" value={money(summary.totalMonthlyPayments)} />
        <Figure compact title="Середня ставка" value={rate} />
        <Figure compact title="До сплати цього місяця" value={money(summary.dueThisMonth)} />
        <Figure
          compact
          title="Вихід із боргів"
          value={summary.debtFreeDate ? formatDateString(summary.debtFreeDate) : '—'}
        />
        <Figure
          compact
          title="Доступний кредитний ліміт"
          value={money(summary.totalCreditAvailable)}
        />
      </CardContent>
    </Card>
  );
}
