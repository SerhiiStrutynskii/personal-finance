import { formatMoney, type Account, type Goal } from '@hf/shared';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
import { parsePlannedAmount, plannedAmountText } from '../budget/plannedAmount.ts';
import { useContribute } from './api.ts';

type SavingsGoal = Extract<Goal, { kind: 'savings' }>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: SavingsGoal | undefined;
  /** Рахунки в гривні, з яких можна поповнити; без архівних і без рахунку цілі. */
  accounts: readonly Account[];
  today: string;
}

/** Поповнення цілі накопичення переказом з іншого рахунку. Керується ззовні. */
export function ContributeDialog({ open, onOpenChange, goal, accounts, today }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вміст монтується при кожному відкритті, тому форма починається з актуальних значень. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? `Поповнити: ${goal.name}` : 'Поповнити'}</DialogTitle>
          <DialogDescription>
            Поповнення — це переказ на рахунок цілі. У бюджеті він не рахується як витрата.
          </DialogDescription>
        </DialogHeader>
        {goal && (
          <ContributeForm
            goal={goal}
            accounts={accounts}
            today={today}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContributeForm({
  goal,
  accounts,
  today,
  onDone,
}: {
  goal: SavingsGoal;
  accounts: readonly Account[];
  today: string;
  onDone: () => void;
}) {
  const contribute = useContribute();
  const { currency } = goal;
  // За замовчуванням — плановий внесок, а якщо його немає — те, що треба відкладати щомісяця.
  const suggested = goal.monthlyContribution ?? goal.requiredMonthly;
  const [amount, setAmount] = useState(
    suggested ? plannedAmountText(Math.min(suggested, goal.remaining), currency) : '',
  );
  const [date, setDate] = useState(today);
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  const parsed = parsePlannedAmount(amount, currency);
  const account = accounts.find((item) => item.id === fromAccountId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amountError =
      typeof parsed === 'string' ? parsed : parsed === 0 ? 'Сума має бути більшою за нуль' : '';
    const dateError =
      date === '' ? 'Вкажіть дату' : date > today ? 'Дата не може бути в майбутньому' : '';
    setErrors({
      ...(amountError && { amount: amountError }),
      ...(dateError && { date: dateError }),
    });
    if (amountError || dateError || typeof parsed !== 'number' || !fromAccountId) return;
    contribute.mutate(
      { id: goal.id, input: { fromAccountId, amount: parsed, date } },
      { onSuccess: onDone },
    );
  }

  if (accounts.length === 0) {
    return <Muted>Щоб поповнити ціль, потрібен інший рахунок у валюті {currency}.</Muted>;
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="З рахунку">
        <SelectField
          value={fromAccountId}
          onChange={setFromAccountId}
          options={accounts.map((item) => ({
            value: item.id,
            label: `${item.name} · ${formatMoney({ amountMinor: item.balance, currency: item.currency })}`,
          }))}
        />
      </Field>
      <Field label={`Сума, ${currency}`} error={errors.amount}>
        <Input
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Дата" error={errors.date}>
        <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {account && typeof parsed === 'number' && account.balance < parsed && (
        <p className="flex items-start gap-1.5 text-sm text-status-over">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>На рахунку «{account.name}» менше коштів, ніж сума поповнення.</span>
        </p>
      )}
      <ErrorText>{contribute.isError && errorMessage(contribute.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={contribute.isPending}>
          Поповнити
        </Button>
      </DialogFooter>
    </form>
  );
}
