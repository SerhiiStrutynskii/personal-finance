import { formatMoney, type ShoppingAnalytics, type ShoppingPeriod } from '@hf/shared';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { monthLabel } from '../../shared/ui/format.ts';
import { Figure } from '../../shared/ui/figure.tsx';
import { Section } from './parts.tsx';
import { ShoppingPeriodSection } from './ShoppingPeriodSection.tsx';
import { signedMoney } from './signedMoney.ts';

/** Куплене за списками покупок: обраний місяць і період; окремо від витрат. */
export function ShoppingSection({
  month,
  period,
}: {
  month: ShoppingAnalytics | undefined;
  period: ShoppingPeriod | undefined;
}) {
  return (
    <Section
      title="Покупки за списками"
      description="Окремо від витрат: списки покупок не створюють транзакцій, тому ці суми не входять у витрати, бюджет і капітал."
      testId="analytics-shopping"
    >
      {month && <MonthFigures data={month} />}
      {period && <ShoppingPeriodSection data={period} />}
    </Section>
  );
}

function MonthFigures({ data }: { data: ShoppingAnalytics }) {
  const { currency } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  if (data.purchaseCount === 0) {
    return (
      <Muted>
        У місяці «{monthLabel(data.month)}» за списками нічого не куплено.{' '}
        <Link className="underline underline-offset-4" to="/shopping">
          Перейти до покупок
        </Link>
      </Muted>
    );
  }
  return (
    <Card data-testid="shopping-month">
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure
          compact
          title={`Куплено за ${monthLabel(data.month).toLowerCase()}`}
          value={money(data.spent)}
          hint={`${signedMoney(data.change, currency)} до попереднього місяця`}
        />
        <Figure
          compact
          title="Відхилення від очікуваних цін"
          value={signedMoney(data.deviation, currency)}
          hint={deviationHint(data)}
        />
        <Figure
          compact
          title="Покупок за місяць"
          value={String(data.purchaseCount)}
          hint={data.unpricedCount > 0 ? `без ціни: ${data.unpricedCount}` : undefined}
        />
      </CardContent>
    </Card>
  );
}

function deviationHint({ deviation }: ShoppingAnalytics): string {
  if (deviation > 0) return 'переплата порівняно з очікуваним';
  if (deviation < 0) return 'економія порівняно з очікуваним';
  return 'як очікували';
}
