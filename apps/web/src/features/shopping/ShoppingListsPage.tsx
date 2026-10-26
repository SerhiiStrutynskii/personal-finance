import { formatMoney } from '@hf/shared';
import { Package, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { formatShortDate } from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { useDeleteShoppingList, useShoppingLists } from './api.ts';
import { ListNameDialog } from './ListNameDialog.tsx';

/** Списки покупок від найновішого, з прогресом і сумами. */
export function ShoppingListsPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const lists = useShoppingLists();
  const remove = useDeleteShoppingList();
  const [creating, setCreating] = useState(false);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        level={2}
        title="Списки покупок"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="max-sm:h-10" asChild>
              <Link to="/menu/products">
                <Package />
                Продукти
              </Link>
            </Button>
            <Button variant="outline" className="max-sm:h-10" asChild>
              <Link to="/menu/shopping?period=week">
                <ShoppingCart />
                Покупки за меню
              </Link>
            </Button>
            <Button className="max-sm:h-10" onClick={() => setCreating(true)}>
              <Plus />
              Список
            </Button>
          </div>
        }
      />
      <ErrorText>{lists.isError && errorMessage(lists.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {lists.isPending && <Muted>Завантаження…</Muted>}
      {lists.data?.length === 0 && (
        <Muted>
          Списків ще немає. Створіть список, додайте продукти — очікувана сума порахується з цін
          довідника.
        </Muted>
      )}

      {lists.data && lists.data.length > 0 && (
        <ul className="space-y-2">
          {lists.data.map((list) => {
            const { totals } = list;
            const money = (amountMinor: number) =>
              formatMoney({ amountMinor, currency: list.currency });
            return (
              <li
                key={list.id}
                data-testid="shopping-list"
                className="flex items-center gap-4 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link className="font-medium hover:underline" to={`/menu/lists/${list.id}`}>
                      {list.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {formatShortDate(list.createdAt, user.timeZone)}
                    </span>
                  </div>
                  <Progress
                    value={totals.itemCount ? (totals.boughtCount / totals.itemCount) * 100 : 0}
                    aria-label={`Куплено ${totals.boughtCount} з ${totals.itemCount}`}
                  />
                  <div className="flex flex-wrap justify-between gap-x-4 text-sm text-muted-foreground">
                    <span>
                      Куплено {totals.boughtCount} з {totals.itemCount}
                    </span>
                    <span className="tabular-nums">
                      Очікувано {money(totals.expected)}
                      {totals.boughtCount > 0 && <> · фактично {money(totals.actual)}</>}
                    </span>
                  </div>
                </div>
                <ConfirmButton
                  title={`Видалити список «${list.name}»?`}
                  description="Куплені в ньому продукти зникнуть з історії цін і аналітики."
                  disabled={remove.isPending}
                  onConfirm={() => remove.mutate(list.id)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <ListNameDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(list) => navigate(`/menu/lists/${list.id}`)}
      />
    </div>
  );
}
