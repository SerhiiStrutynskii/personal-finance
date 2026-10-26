import {
  MAX_SERVINGS,
  formatMoney,
  type MealType,
  type MenuDay,
  type MenuEntry,
  type MenuProductEntry,
} from '@hf/shared';
import { Minus, Pencil, Plus, Printer, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import { AddEntryDialog } from './AddEntryDialog.tsx';
import { useDeleteMenuEntry, useUpdateMenuEntry } from './api.ts';
import { dayTitle, entryAmountLabel, groupDay, servingsLabel } from './calendar.ts';
import { IncompletePriceBadge } from './IncompletePriceBadge.tsx';
import { QuantityDialog } from './QuantityDialog.tsx';

interface Props {
  date: string;
  /** Записи цього дня (у порядку з API). */
  entries: readonly MenuEntry[];
  day: MenuDay | undefined;
  currency: string;
  mealTypes: readonly MealType[];
}

/** Меню вибраного дня: прийоми їжі зі стравами (порції) і продуктами (кількість) та вартість. */
export function MenuDayPanel({ date, entries, day, currency, mealTypes }: Props) {
  const update = useUpdateMenuEntry();
  const remove = useDeleteMenuEntry();
  // Вміст вікна зберігається й після закриття, щоб не змінюватися під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; mealType?: MealType }>({ open: false });
  const [quantity, setQuantity] = useState<{ open: boolean; entry?: MenuProductEntry }>({
    open: false,
  });
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
        <Button variant="outline" className="max-sm:h-10" asChild>
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
            <Button
              variant="ghost"
              size="sm"
              className="max-sm:h-10"
              onClick={() => setDialog({ open: true, mealType })}
            >
              <Plus />
              Додати
            </Button>
          </div>
          {mealEntries.length === 0 ? (
            <Muted>Нічого не заплановано</Muted>
          ) : (
            <ul className="divide-y text-sm">
              {mealEntries.map((entry) => (
                // Без ListRow: на телефоні рядок переноситься — назва зверху, під нею порції чи
                // кількість, вартість і «Прибрати».
                <li
                  key={entry.id}
                  data-testid="menu-entry"
                  data-kind={entry.kind}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                >
                  <span className="min-w-0 basis-full break-words md:flex-1 md:basis-0">
                    {entry.name}
                  </span>
                  {entry.kind === 'dish' ? (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="max-sm:size-10"
                        aria-label="Менше порцій"
                        disabled={entry.servings <= 1 || update.isPending}
                        onClick={() =>
                          update.mutate({ id: entry.id, servings: entry.servings - 1 })
                        }
                      >
                        <Minus />
                      </Button>
                      <span className="min-w-20 text-center tabular-nums" data-testid="servings">
                        {servingsLabel(entry.servings)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="max-sm:size-10"
                        aria-label="Більше порцій"
                        disabled={entry.servings >= MAX_SERVINGS || update.isPending}
                        onClick={() =>
                          update.mutate({ id: entry.id, servings: entry.servings + 1 })
                        }
                      >
                        <Plus />
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="tabular-nums" data-testid="quantity">
                        {entryAmountLabel(entry)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-sm:size-10"
                        aria-label="Змінити кількість"
                        title="Змінити кількість"
                        onClick={() => setQuantity({ open: true, entry })}
                      >
                        <Pencil />
                      </Button>
                    </span>
                  )}
                  <span className="ml-auto inline-flex items-center gap-2 tabular-nums">
                    {!entry.isPriceComplete && (
                      <IncompletePriceBadge unpricedCount={entry.unpricedCount} />
                    )}
                    <span data-testid="entry-cost">{money(entry.cost)}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="max-sm:h-10"
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
      <QuantityDialog
        open={quantity.open}
        onOpenChange={(open) => setQuantity({ ...quantity, open })}
        entry={quantity.entry}
      />
    </section>
  );
}
