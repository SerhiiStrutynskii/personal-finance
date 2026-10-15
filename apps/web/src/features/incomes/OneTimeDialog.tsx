import type { Account, Category } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
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
import { parsePlannedAmount } from '../budget/plannedAmount.ts';
import { categoryOptions } from '../categories/tree.ts';
import { useCreateOneTimeIncome } from './api.ts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  /** Рахунки у валюті доходів. */
  accounts: readonly Account[];
  /** Категорії доходів. */
  categories: readonly Category[];
  defaultDate: string;
}

/** Вікно нового разового доходу: бонус, продаж речі, подарунок, повернення боргу. */
export function OneTimeDialog({ open, onOpenChange, ...form }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Разовий дохід</DialogTitle>
          <DialogDescription>Разовий дохід одразу вважається отриманим.</DialogDescription>
        </DialogHeader>
        <OneTimeForm {...form} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OneTimeForm({
  currency,
  accounts,
  categories,
  defaultDate,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const create = useCreateOneTimeIncome();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [errors, setErrors] = useState<{ name?: string; amount?: string; date?: string }>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePlannedAmount(amount, currency);
    const trimmed = name.trim();
    const next = {
      ...((trimmed === '' || trimmed.length > 100) && { name: 'Вкажіть назву до 100 символів' }),
      ...(typeof parsed === 'string' && { amount: parsed }),
      ...(parsed === 0 && { amount: 'Сума має бути більшою за нуль' }),
      ...(date === '' && { date: 'Вкажіть дату' }),
    };
    setErrors(next);
    if (Object.keys(next).length > 0 || typeof parsed !== 'number') return;

    create.mutate(
      { name: trimmed, amount: parsed, date, accountId, ...(categoryId && { categoryId }) },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Назва" error={errors.name}>
        <Input
          autoFocus
          placeholder="Продаж велосипеда"
          value={name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Сума, ${currency}`} error={errors.amount}>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            aria-invalid={errors.amount ? true : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Дата надходження" error={errors.date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Рахунок">
        <SelectField
          value={accountId}
          onChange={setAccountId}
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        />
      </Field>
      <Field label="Категорія">
        <SelectField
          value={categoryId}
          onChange={setCategoryId}
          options={[{ value: '', label: 'Без категорії' }, ...categoryOptions(categories)]}
        />
      </Field>
      <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={create.isPending}>
          Додати
        </Button>
      </DialogFooter>
    </form>
  );
}
