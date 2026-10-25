import { DEFAULT_CURRENCY, formatMoney, localDateKey, type MenuShoppingItem } from '@hf/shared';
import { CalendarDays, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { ListRow } from '../../shared/ui/list-row.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { PRODUCT_UNIT_LABELS } from '../shopping/productForm.ts';
import { moneyOrDash, quantityLabel } from '../shopping/shoppingForm.ts';
import { useCreateShoppingListFromMenu, useMenuShopping } from './api.ts';
import { selectedDate } from './calendar.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';
import {
  PERIOD_KINDS,
  parsePeriodKind,
  periodLabel,
  periodRange,
  shiftPeriod,
  unpricedProductsText,
  type MenuPeriodKind,
} from './period.ts';

/**
 * Покупки за меню: які продукти й скільки потрібно для страв дня, тижня чи місяця, з орієнтовною
 * вартістю, і створення з них звичайного списку покупок. Період — у ?period=&date=, тож
 * перезавантаження його зберігає; без дати — сьогодні в часовому поясі користувача.
 */
export function MenuShoppingPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = localDateKey(new Date(), user.timeZone);
  const kind = parsePeriodKind(params.get('period'));
  const date = selectedDate(params.get('date'), today);
  const { from, to } = periodRange(kind, date);
  const shopping = useMenuShopping(from, to);
  const create = useCreateShoppingListFromMenu();

  const currency = shopping.data?.currency ?? DEFAULT_CURRENCY;
  const total = shopping.data?.total;
  const items = shopping.data?.items ?? [];
  const show = (nextKind: MenuPeriodKind, nextDate: string) => {
    create.reset();
    setParams({ period: nextKind, date: nextDate });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Покупки за меню"
        action={
          <Button variant="outline" className="max-sm:h-10" asChild>
            <Link to={`/menu?date=${from}`}>
              <CalendarDays />
              До календаря
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1" role="group" aria-label="Період">
          {PERIOD_KINDS.map((option) => (
            <Button
              key={option.kind}
              variant={option.kind === kind ? 'default' : 'outline'}
              className="max-sm:h-10"
              aria-pressed={option.kind === kind}
              onClick={() => show(option.kind, date)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="max-sm:size-10"
            aria-label="Попередній період"
            onClick={() => show(kind, shiftPeriod(kind, date, -1))}
          >
            <ChevronLeft />
          </Button>
          <span
            className="min-w-0 text-center font-medium first-letter:uppercase"
            data-testid="menu-shopping-period"
          >
            {periodLabel(kind, date)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="max-sm:size-10"
            aria-label="Наступний період"
            onClick={() => show(kind, shiftPeriod(kind, date, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <ErrorText>{shopping.isError && errorMessage(shopping.error)}</ErrorText>

      {shopping.isPending ? (
        <Muted>Завантаження…</Muted>
      ) : (
        shopping.data && (
          <>
            <section
              className="space-y-1 rounded-lg border p-3"
              aria-label="Бюджет на продукти"
              data-testid="menu-shopping-budget"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Бюджет на продукти</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney({ amountMinor: total?.cost ?? 0, currency })}
                </span>
                {total && total.unpricedCount > 0 && (
                  <IncompletePriceBadge unpricedCount={total.unpricedCount} />
                )}
              </div>
              {total && total.unpricedCount > 0 && (
                <p className="text-sm text-muted-foreground" data-testid="menu-shopping-unpriced">
                  {unpricedProductsText(total.unpricedCount)}
                </p>
              )}
            </section>

            {items.length === 0 ? (
              <Muted>
                За цей період у меню немає продуктів.{' '}
                <Link className="text-primary underline" to={`/menu?date=${from}`}>
                  Відкрити календар
                </Link>
              </Muted>
            ) : (
              <>
                <ul className="divide-y text-sm">
                  {items.map((item) => (
                    <ShoppingRow key={item.productId} item={item} currency={currency} />
                  ))}
                </ul>
                <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
                <Button
                  className="max-sm:h-10 max-sm:w-full"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate(
                      { from, to },
                      { onSuccess: (list) => navigate(`/shopping/${list.id}`) },
                    )
                  }
                >
                  <ShoppingCart />
                  Створити список покупок
                </Button>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}

/** Продукт: назва, під нею кількість і ціна за одиницю, сума; на телефоні сума — під кількістю. */
function ShoppingRow({ item, currency }: { item: MenuShoppingItem; currency: string }) {
  const unit = PRODUCT_UNIT_LABELS[item.unit];
  return (
    <ListRow
      data-testid="menu-shopping-item"
      className="py-2 max-sm:flex-col max-sm:gap-0.5"
      meta={
        <>
          <span data-testid="menu-shopping-quantity">{quantityLabel(item)}</span>
          {' · '}
          <span data-testid="menu-shopping-unit-price">
            {item.unitPrice === null
              ? 'немає ціни'
              : `${formatMoney({ amountMinor: item.unitPrice, currency })} / ${unit}`}
          </span>
        </>
      }
      amount={
        <span data-testid="menu-shopping-line-total">{moneyOrDash(item.lineTotal, currency)}</span>
      }
    >
      <span className="font-medium" data-testid="menu-shopping-name">
        {item.name}
      </span>
    </ListRow>
  );
}
