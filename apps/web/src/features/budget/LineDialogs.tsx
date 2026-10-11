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
import { useSaveExpenseLine, useSaveIncomeLine } from './api.ts';
import { parsePlannedAmount, plannedAmountText } from './plannedAmount.ts';

type IncomeLine = BudgetView['incomeLines'][number];
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

// --- Стаття доходу ---

export function IncomeLineDialog({
  line,
  ...props
}: DialogProps & { line?: IncomeLine | undefined }) {
  return (
    <LineDialogShell
      {...props}
      title={line ? 'Стаття доходу' : 'Нова стаття доходу'}
      description="Скільки ви плануєте отримати за цією статтею протягом місяця."
    >
      <IncomeLineForm budget={props.budget} line={line} onSaved={() => props.onOpenChange(false)} />
    </LineDialogShell>
  );
}

function IncomeLineForm({
  budget,
  line,
  onSaved,
}: {
  budget: BudgetView;
  line: IncomeLine | undefined;
  onSaved: () => void;
}) {
  const save = useSaveIncomeLine(budget.id);
  const [name, setName] = useState(line?.name ?? '');
  const [amount, setAmount] = useState(
    line ? plannedAmountText(line.planned, budget.currency) : '',
  );
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const plannedAmount = parsePlannedAmount(amount, budget.currency);
    const trimmed = name.trim();
    const next = {
      ...((trimmed === '' || trimmed.length > 100) && { name: 'Вкажіть назву до 100 символів' }),
      ...(typeof plannedAmount === 'string' && { amount: plannedAmount }),
    };
    setErrors(next);
    if (Object.keys(next).length > 0 || typeof plannedAmount !== 'number') return;

    save.mutate(
      { lineId: line?.id, input: { name: trimmed, plannedAmount } },
      { onSuccess: onSaved },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Назва" error={errors.name}>
        <Input
          autoFocus
          placeholder="Зарплата"
          value={name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={`Запланована сума, ${budget.currency}`} error={errors.amount}>
        <Input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <FormActions pending={save.isPending} />
    </form>
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
