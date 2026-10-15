import { formatMoney, type BudgetView } from '@hf/shared';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../shared/ui/button.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { Progress } from '../../shared/ui/progress.tsx';
import { AddCategoryDialog } from '../categories/AddCategoryDialog.tsx';
import { InlineLimit } from './InlineLimit.tsx';
import { CategoryStatusLabel } from './status.tsx';
import { STATUS_BAR_CLASS, STATUS_ROW_CLASS } from './statusStyles.ts';

type ExpenseLine = BudgetView['expenseLines'][number];

interface Props {
  budget: BudgetView;
  /** Відкриває вікно нового ліміту; categoryId — категорія, обрана заздалегідь. */
  onAddLimit: (categoryId?: string) => void;
  /** Чи можна ще задати ліміт на категорію (немає конфлікту з групою чи підкатегоріями). */
  canAddLimit: (categoryId: string) => boolean;
  onDeleteLine: (line: ExpenseLine) => void;
}

/**
 * Ліміти й фактичні витрати по категоріях. Видатки тут не додаються: для цього є кнопка
 * «+ Видаток» у шапці екрана. Чи можна змінювати ліміти, вирішує бекенд (canEditLimits).
 * Нова категорія витрат одразу відкриває вікно ліміту на неї.
 */
export function ExpenseSection({ budget, onAddLimit, canAddLimit, onDeleteLine }: Props) {
  const { currency, canEditLimits } = budget;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Витрати</h2>
        {canEditLimits && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AddCategoryDialog
              fixedKind="expense"
              trigger={<Button variant="ghost">Нова категорія</Button>}
              onCreated={(category) => onAddLimit(category.id)}
            />
            <Button variant="outline" onClick={() => onAddLimit()}>
              Додати ліміт
            </Button>
          </div>
        )}
      </div>

      {budget.expenseLines.length === 0 && <Muted>Лімітів на категорії ще немає.</Muted>}

      <ul className="space-y-2">
        {budget.expenseLines.map((line) => (
          <li
            key={line.id}
            data-testid="expense-line"
            data-status={line.status}
            className={`rounded-lg border p-3 ${STATUS_ROW_CLASS[line.status]}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="font-medium">{line.categoryName}</div>
              <div className="flex items-center gap-1 text-sm">
                <span className="tabular-nums">{money(line.spent)}</span>
                <span className="text-muted-foreground">з</span>
                <InlineLimit budget={budget} line={line} editable={canEditLimits} />
                {canEditLimits && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Видалити ліміт «${line.categoryName}»`}
                    onClick={() => onDeleteLine(line)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
            <Progress
              className={`my-2 h-1.5 ${STATUS_BAR_CLASS[line.status]}`}
              // Без ліміту, але з витратами частка нескінченна (usage = null): смуга заповнена.
              value={Math.min(100, (line.usage ?? 1) * 100)}
              aria-label={`Використано ліміту «${line.categoryName}»`}
            />
            <div className="text-sm">
              <CategoryStatusLabel
                status={line.status}
                remaining={line.remaining}
                currency={currency}
              />
            </div>
            {line.subcategories && (
              <SubcategoryBreakdown items={line.subcategories} money={money} />
            )}
          </li>
        ))}
      </ul>

      {budget.unplannedExpenses.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="font-heading font-semibold">Незаплановані витрати</h3>
          <ul className="space-y-2">
            {budget.unplannedExpenses.map((item) => (
              <li
                key={item.categoryId ?? 'uncategorized'}
                data-testid="unplanned-expense"
                data-status={item.status}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border p-3 ${STATUS_ROW_CLASS[item.status]}`}
              >
                <div>
                  <div className="font-medium">{item.categoryName}</div>
                  <div className="text-sm">
                    <CategoryStatusLabel
                      status={item.status}
                      remaining={-item.spent}
                      currency={currency}
                    />
                  </div>
                </div>
                {/* Для витрат без категорії ліміт задати неможливо: його прив'язано до категорії. */}
                {canEditLimits && item.categoryId && canAddLimit(item.categoryId) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAddLimit(item.categoryId ?? undefined)}
                  >
                    Додати ліміт
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Розгортний список витрат підкатегорій у рядку ліміту групи. */
function SubcategoryBreakdown({
  items,
  money,
}: {
  items: NonNullable<ExpenseLine['subcategories']>;
  money: (amountMinor: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="mt-1 text-sm">
      <button
        type="button"
        className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 text-muted-foreground hover:bg-muted"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron className="size-4" aria-hidden />
        За підкатегоріями
      </button>
      {open && (
        <ul className="mt-1 ml-5 space-y-0.5" data-testid="budget-subcategories">
          {items.map((item) => (
            <li
              key={`${item.categoryId}:${item.categoryName}`}
              className="flex justify-between gap-4"
            >
              <span>{item.categoryName}</span>
              <span className="tabular-nums">{money(item.spent)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
