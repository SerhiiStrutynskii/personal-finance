import type { BudgetView, Category } from '@hf/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field, Muted } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useSaveExpenseLine } from './api.ts';
import { parsePlannedAmount, plannedAmountText } from './plannedAmount.ts';

type ExpenseLine = BudgetView['expenseLines'][number];

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetView;
}

function LineDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: Omit<DialogProps, 'budget'> & { title: string; description: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вміст монтується при кожному відкритті, тому форма починається з актуальних значень. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function FormActions({ pending }: { pending: boolean }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Скасувати</Button>
      </DialogClose>
      <Button type="submit" disabled={pending}>
        Зберегти
      </Button>
    </DialogFooter>
  );
}

// --- Ліміт витрат ---

export function ExpenseLineDialog({
  line,
  categories,
  ...props
}: DialogProps & {
  line?: ExpenseLine | undefined;
  /** Категорії витрат домогосподарства. */
  categories: readonly Category[];
}) {
  return (
    <LineDialogShell
      {...props}
      title={line ? `Ліміт: ${line.categoryName}` : 'Новий ліміт витрат'}
      description="Скільки ви плануєте витратити в цій категорії протягом місяця."
    >
      <ExpenseLineForm
        budget={props.budget}
        line={line}
        categories={categories}
        onSaved={() => props.onOpenChange(false)}
      />
    </LineDialogShell>
  );
}

function ExpenseLineForm({
  budget,
  line,
  categories,
  onSaved,
}: {
  budget: BudgetView;
  line: ExpenseLine | undefined;
  categories: readonly Category[];
  onSaved: () => void;
}) {
  const save = useSaveExpenseLine(budget.id);
  // Категорія може мати лише один ліміт на місяць.
  const planned = new Set(budget.expenseLines.map((item) => item.categoryId));
  const available = categories.filter((category) => !planned.has(category.id));

  const [categoryId, setCategoryId] = useState(line?.categoryId ?? available[0]?.id ?? '');
  const [amount, setAmount] = useState(
    line ? plannedAmountText(line.planned, budget.currency) : '',
  );
  const [amountError, setAmountError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const plannedAmount = parsePlannedAmount(amount, budget.currency);
    if (typeof plannedAmount === 'string') {
      setAmountError(plannedAmount);
      return;
    }
    setAmountError(undefined);
    save.mutate({ lineId: line?.id, input: { categoryId, plannedAmount } }, { onSuccess: onSaved });
  }

  if (!line && available.length === 0) {
    return (
      <Muted>
        На всі категорії витрат уже задано ліміти. Нову категорію можна додати на сторінці{' '}
        <Link className="underline" to="/categories">
          «Категорії»
        </Link>
        .
      </Muted>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      {!line && (
        <Field label="Категорія">
          <SelectField
            value={categoryId}
            onChange={setCategoryId}
            options={available.map((category) => ({ value: category.id, label: category.name }))}
          />
        </Field>
      )}
      <Field label={`Ліміт, ${budget.currency}`} error={amountError}>
        <Input
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          aria-invalid={amountError ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <FormActions pending={save.isPending} />
    </form>
  );
}
