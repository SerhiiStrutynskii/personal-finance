import { DEFAULT_CURRENCY, formatMoney, localDateKey } from '@hf/shared';
import { BookOpen, ShoppingCart } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { MonthSwitcher } from '../../shared/ui/month-switcher.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { useMealTypes, useMenuPeriod } from './api.ts';
import { dateForMonth, incompleteDishesLabel, monthRange, selectedDate } from './calendar.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';
import { MenuDayPanel } from './MenuDayPanel.tsx';
import { MonthGrid } from './MonthGrid.tsx';

/**
 * Календар меню на місяць. Вибраний день — у параметрі ?date=, тож посилання з друку повертає
 * на той самий день; без параметра вибрано сьогодні в часовому поясі користувача.
 */
export function MenuPage() {
  const { user } = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date(), user.timeZone);
  const selected = selectedDate(params.get('date'), today);
  const month = selected.slice(0, 7);
  const { from, to } = monthRange(month);
  const period = useMenuPeriod(from, to);
  const mealTypes = useMealTypes();

  const currency = period.data?.currency ?? DEFAULT_CURRENCY;
  const total = period.data?.total;
  const select = (date: string) => setParams({ date }, { replace: true });

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title="Меню"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="max-sm:h-10" asChild>
              <Link to={`/menu/shopping?period=week&date=${selected}`}>
                <ShoppingCart />
                Покупки за меню
              </Link>
            </Button>
            <Button variant="outline" className="max-sm:h-10" asChild>
              <Link to="/menu/dictionaries">
                <BookOpen />
                Страви й прийоми їжі
              </Link>
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <MonthSwitcher
          month={month}
          onChange={(next) => setParams({ date: dateForMonth(next, today) })}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Вартість за місяць:{' '}
            <span className="font-semibold tabular-nums" data-testid="menu-month-total">
              {formatMoney({ amountMinor: total?.cost ?? 0, currency })}
            </span>
          </span>
          {total && !total.isPriceComplete && (
            <IncompletePriceBadge hint={incompleteDishesLabel(total.incompleteEntryCount)} />
          )}
        </div>
      </div>

      <ErrorText>{period.isError && errorMessage(period.error)}</ErrorText>
      <ErrorText>{mealTypes.isError && errorMessage(mealTypes.error)}</ErrorText>

      {/* Від lg — панель дня праворуч від сітки; вужче — під нею. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <MonthGrid
          month={month}
          days={period.data?.days ?? []}
          currency={currency}
          today={today}
          selected={selected}
          onSelect={select}
        />
        {period.isPending || mealTypes.isPending ? (
          <Muted>Завантаження…</Muted>
        ) : (
          <MenuDayPanel
            date={selected}
            entries={(period.data?.entries ?? []).filter((entry) => entry.date === selected)}
            day={period.data?.days.find((day) => day.date === selected)}
            currency={currency}
            mealTypes={mealTypes.data ?? []}
          />
        )}
      </div>
    </div>
  );
}
