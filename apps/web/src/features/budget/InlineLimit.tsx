import { formatMoney, type BudgetView } from '@hf/shared';
import { Check, Pencil, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { useSaveExpenseLine } from './api.ts';
import { parsePlannedAmount, plannedAmountText } from './plannedAmount.ts';

type ExpenseLine = BudgetView['expenseLines'][number];

/** Ліміт категорії, який редагується прямо в рядку: Enter зберігає, Escape скасовує. */
export function InlineLimit({
  budget,
  line,
  editable,
}: {
  budget: BudgetView;
  line: ExpenseLine;
  editable: boolean;
}) {
  const save = useSaveExpenseLine(budget.id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const money = formatMoney({ amountMinor: line.planned, currency: budget.currency });

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="tabular-nums" data-testid="limit-amount">
          {money}
        </span>
        {editable && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Змінити ліміт «${line.categoryName}»`}
            onClick={() => {
              setText(plannedAmountText(line.planned, budget.currency));
              setError(undefined);
              save.reset();
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
        )}
      </span>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const plannedAmount = parsePlannedAmount(text, budget.currency);
    if (typeof plannedAmount === 'string') {
      setError(plannedAmount);
      return;
    }
    setError(undefined);
    save.mutate(
      { lineId: line.id, input: { categoryId: line.categoryId, plannedAmount } },
      { onSuccess: () => setEditing(false) },
    );
  }

  const message = error ?? (save.isError ? errorMessage(save.error) : undefined);

  return (
    <form className="inline-flex flex-col items-end gap-1" onSubmit={handleSubmit} noValidate>
      <span className="inline-flex items-center gap-1">
        <Input
          autoFocus
          className="h-7 w-28 text-right"
          inputMode="decimal"
          aria-label={`Ліміт «${line.categoryName}», ${budget.currency}`}
          aria-invalid={message ? true : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
        <Button type="submit" size="icon-sm" aria-label="Зберегти ліміт" disabled={save.isPending}>
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Скасувати"
          onClick={() => setEditing(false)}
        >
          <X />
        </Button>
      </span>
      {message && (
        <span role="alert" className="text-xs text-destructive">
          {message}
        </span>
      )}
    </form>
  );
}
