import { TREND_LENGTHS, localMonthKey, type TrendLength } from '@hf/shared';
import { useState } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { MonthSwitcher } from '../../shared/ui/month-switcher.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { useMonthAnalytics, useTrendAnalytics } from './api.ts';
import { CategoriesSection } from './CategoriesSection.tsx';
import { NetWorthSection } from './NetWorthSection.tsx';
import { useShoppingAnalytics } from '../shopping/api.ts';
import { OverspendingSection } from './OverspendingSection.tsx';
import { ShoppingSection } from './ShoppingSection.tsx';
import { TrendSection } from './TrendSection.tsx';

export function AnalyticsPage() {
  const { user } = useCurrentUser();
  // Аналізується обраний місяць; у майбутнє гортати не можна.
  const currentMonth = localMonthKey(new Date(), user.timeZone);
  const [month, setMonth] = useState(currentMonth);
  const [length, setLength] = useState<TrendLength>(6);
  const monthData = useMonthAnalytics(month);
  const trend = useTrendAnalytics(month, length);
  const shopping = useShoppingAnalytics(month);
  const error = monthData.error ?? trend.error ?? shopping.error;

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Аналітика"
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <MonthSwitcher month={month} max={currentMonth} onChange={setMonth} />
            <div className="flex gap-1" role="group" aria-label="Довжина динаміки">
              {TREND_LENGTHS.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={value === length ? 'default' : 'outline'}
                  aria-pressed={value === length}
                  onClick={() => setLength(value)}
                >
                  {value} міс.
                </Button>
              ))}
            </div>
          </div>
        }
      />
      <ErrorText>{error && errorMessage(error)}</ErrorText>
      {(monthData.isPending || trend.isPending) && !error && <Muted>Завантаження…</Muted>}

      {monthData.data && <CategoriesSection data={monthData.data} />}
      {trend.data && <TrendSection data={trend.data} />}
      {monthData.data && <OverspendingSection data={monthData.data} />}
      {trend.data && <NetWorthSection data={trend.data} />}
      {shopping.data && <ShoppingSection data={shopping.data} />}
    </div>
  );
}
