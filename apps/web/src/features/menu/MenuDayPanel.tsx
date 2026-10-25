import { MAX_SERVINGS, formatMoney, type MealType, type MenuDay, type MenuEntry } from '@hf/shared';
import { Minus, Plus, Printer, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import { AddEntryDialog } from './AddEntryDialog.tsx';
import { useDeleteMenuEntry, useUpdateMenuEntry } from './api.ts';
import { dayTitle, groupDay, servingsLabel } from './calendar.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';

interface Props {
  date: string;
  /** Записи цього дня (у порядку з API). */
  entries: readonly MenuEntry[];
  day: MenuDay | undefined;
  currency: string;
  mealTypes: readonly MealType[];
}

/** Меню вибраного дня: прийоми їжі з їхніми стравами, порції й вартість. */
export function MenuDayPanel({ date, entries, day, currency, mealTypes }: Props) {
  const update = useUpdateMenuEntry();
  const remove = useDeleteMenuEntry();
  // Вміст вікна зберігається й після закриття, щоб не змінюватися під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; mealType?: MealType }>({ open: false });
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <section className="space-y-4" aria-label="Меню дня" data-testid="menu-day-panel">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-heading text-lg font-semibold first-letter:uppercase">
            {dayTitle(date)}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Вартість дня:{' '}
              <span className="font-medium tabular-nums" data-testid="menu-day-total">
                {money(day?.cost ?? 0)}
              </span>
            </span>
            {day && !day.isPriceComplete && <IncompletePriceBadge hint="Ціна неповна" />}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to={`/menu/print/${date}`}>
            <Printer />
            Друк
          </Link>
        </Button>
      </div>

      <ErrorText>{update.isError && errorMessage(update.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>

      {mealTypes.length === 0 && (
        <Muted>
          <Link className="text-primary underline" to="/menu/dictionaries">
            Додайте прийоми їжі в довідниках
          </Link>
        </Muted>
      )}

      {groupDay(entries, mealTypes).map(({ mealType, entries: mealEntries }) => (
        <section
          key={mealType.id}
          aria-label={mealType.name}
          data-testid="menu-meal"
          className="space-y-1"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">{mealType.name}</h3>
            <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, mealType })}>
              <Plus />
              Додати страву
            </Button>
          </div>
          {mealEntries.length === 0 ? (
            <Muted>Нічого не заплановано</Muted>
          ) : (
            <ul className="divide-y text-sm">
              {mealEntries.map((entry) => (
                // Без ListRow: на телефоні рядок переноситься — назва зверху, під нею порції,
                // вартість і «Прибрати».
                <li
                  key={entry.id}
                  data-testid="menu-entry"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                >
                  <span className="min-w-0 basis-full break-words md:flex-1 md:basis-0">
                    {entry.dishName}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Менше порцій"
                      disabled={entry.servings <= 1 || update.isPending}
                      onClick={() => update.mutate({ id: entry.id, servings: entry.servings - 1 })}
                    >
                      <Minus />
                    </Button>
                    <span className="min-w-20 text-center tabular-nums" data-testid="servings">
                      {servingsLabel(entry.servings)}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Більше порцій"
                      disabled={entry.servings >= MAX_SERVINGS || update.isPending}
                      onClick={() => update.mutate({ id: entry.id, servings: entry.servings + 1 })}
                    >
                      <Plus />
                    </Button>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-2 tabular-nums">
                    {!entry.isPriceComplete && (
                      <IncompletePriceBadge unpricedCount={entry.unpricedCount} />
                    )}
                    <span data-testid="entry-cost">{money(entry.cost)}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(entry.id)}
                  >
                    <X />
                    Прибрати
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <AddEntryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        date={date}
        mealType={dialog.mealType}
      />
    </section>
  );
}
