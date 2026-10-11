import { formatMoney, type BudgetView } from '@hf/shared';
import { Plus } from 'lucide-react';
import { Button } from '../../shared/ui/button.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { Progress } from '../../shared/ui/progress.tsx';
import { LineMenu } from './LineMenu.tsx';
import { CategoryStatusLabel } from './status.tsx';
import { STATUS_BAR_CLASS, STATUS_ROW_CLASS } from './statusStyles.ts';

type ExpenseLine = BudgetView['expenseLines'][number];

interface Props {
  budget: BudgetView;
  /** false для закритого бюджету: ліміти лише для перегляду. */
  editable: boolean;
  /** false, якщо немає рахунків і витрату додати неможливо. */
  canAddTransactions: boolean;
  onAddLine: () => void;
  onEditLine: (line: ExpenseLine) => void;
  onDeleteLine: (line: ExpenseLine) => void;
  onAddExpense: (categoryId: string | null) => void;
}

export function ExpenseSection({
  budget,
  editable,
  canAddTransactions,
  onAddLine,
  onEditLine,
  onDeleteLine,
  onAddExpense,
}: Props) {
  const { currency } = budget;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Витрати</h2>
        {editable && (
          <Button variant="outline" onClick={onAddLine}>
            Додати ліміт
          </Button>
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
              <div className="flex items-center gap-1">
                <span className="mr-2 text-sm tabular-nums">
                  {money(line.spent)} з {money(line.planned)}
                </span>
                {canAddTransactions && (
                  <Button variant="outline" size="sm" onClick={() => onAddExpense(line.categoryId)}>
                    <Plus />
                    витрата
                  </Button>
                )}
                {editable && (
                  <LineMenu
                    label={`Дії з лімітом «${line.categoryName}»`}
                    onEdit={() => onEditLine(line)}
                    onDelete={() => onDeleteLine(line)}
                  />
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
                <div className="font-medium">{item.categoryName}</div>
                <div className="text-sm">
                  <CategoryStatusLabel
                    status={item.status}
                    remaining={-item.spent}
                    currency={currency}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
