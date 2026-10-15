import type { BudgetView, Category } from '@hf/shared';
import { useState, type FormEvent } from 'react';
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
import { categoryOptions } from '../categories/tree.ts';
import { useSaveExpenseLine } from './api.ts';
import { limitableCategories } from './limitable.ts';
import { parsePlannedAmount } from './plannedAmount.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetView;
  /** Категорії витрат домогосподарства. */
  categories: readonly Category[];
  /** Категорія, обрана заздалегідь, — коли ліміт додають із незапланованих витрат. */
  defaultCategoryId?: string | undefined;
}

/** Вікно нового ліміту на категорію. Наявний ліміт редагується прямо в рядку. */
export function AddLimitDialog({ open, onOpenChange, ...form }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вміст монтується при кожному відкритті, тому форма починається з актуальних значень. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новий ліміт витрат</DialogTitle>
          <DialogDescription>
            Скільки ви плануєте витратити в цій категорії протягом місяця.
          </DialogDescription>
        </DialogHeader>
        <AddLimitForm {...form} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddLimitForm({
  budget,
  categories,
  defaultCategoryId,
  onSaved,
}: Omit<Props, 'open' | 'onOpenChange'> & { onSaved: () => void }) {
  const save = useSaveExpenseLine(budget.id);
  // Категорія може мати лише один ліміт на місяць, а група й її підкатегорії — не разом.
  const planned = new Set(budget.expenseLines.map((item) => item.categoryId));
  const availableIds = new Set(limitableCategories(categories, planned).map((item) => item.id));
  // Порядок і повні назви — як в усіх списках категорій: підкатегорії під своєю групою.
  const options = categoryOptions(categories).filter((option) => availableIds.has(option.value));

  const [categoryId, setCategoryId] = useState(
    options.find((option) => option.value === defaultCategoryId)?.value ?? options[0]?.value ?? '',
  );
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const plannedAmount = parsePlannedAmount(amount, budget.currency);
    if (typeof plannedAmount === 'string') {
      setAmountError(plannedAmount);
      return;
    }
    setAmountError(undefined);
    save.mutate({ input: { categoryId, plannedAmount } }, { onSuccess: onSaved });
  }

  if (options.length === 0) {
    return (
      <Muted>
        Усі категорії витрат уже мають ліміт — свій або своєї групи. Нову категорію можна додати
        кнопкою «Нова категорія» або на сторінці{' '}
        <Link className="underline" to="/categories">
          «Категорії»
        </Link>
        .
      </Muted>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Категорія">
        <SelectField value={categoryId} onChange={setCategoryId} options={options} />
      </Field>
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
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={save.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
