import { formatMoney, type Account } from '@hf/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
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
import { formatDate } from '../../shared/ui/format.ts';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { parsePlannedAmount, plannedAmountText } from '../budget/plannedAmount.ts';
import { useDeleteTransaction, useTransactions } from '../transactions/api.ts';
import { useReceiveOccurrence, useUpdateOccurrence } from './api.ts';
import type { Occurrence } from './occurrenceStyles.ts';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: Occurrence | undefined;
  currency: string;
}

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
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

function Actions({ pending, label = 'Зберегти' }: { pending: boolean; label?: string }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Скасувати</Button>
      </DialogClose>
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </DialogFooter>
  );
}

/** Нуль для суми надходження не підходить: дохід має бути більшим за нуль. */
function parsePositive(text: string, currency: string): number | string {
  const amount = parsePlannedAmount(text, currency);
  return amount === 0 ? 'Сума має бути більшою за нуль' : amount;
}

// --- «Отримано» ---

export function ReceiveDialog({
  accounts,
  today,
  ...props
}: DialogProps & { accounts: readonly Account[]; today: string }) {
  const { occurrence } = props;
  return (
    <Shell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={occurrence ? `Отримано: ${occurrence.name}` : 'Отримано'}
      description="Запишіть, скільки й коли надійшло. Якщо дохід прийшов частинами, додайте кожну окремо."
    >
      {occurrence && (
        <ReceiveForm
          occurrence={occurrence}
          currency={props.currency}
          accounts={accounts}
          today={today}
          onDone={() => props.onOpenChange(false)}
        />
      )}
    </Shell>
  );
}

function ReceiveForm({
  occurrence,
  currency,
  accounts,
  today,
  onDone,
}: {
  occurrence: Occurrence;
  currency: string;
  accounts: readonly Account[];
  today: string;
  onDone: () => void;
}) {
  const receive = useReceiveOccurrence();
  // Для частково отриманого надходження пропонуємо решту суми.
  const remaining = Math.max(0, occurrence.plannedAmount - occurrence.actualAmount);
  const [amount, setAmount] = useState(
    plannedAmountText(remaining || occurrence.plannedAmount, currency),
  );
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(occurrence.accountId ?? accounts[0]?.id ?? '');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePositive(amount, currency);
    const next = {
      ...(typeof parsed === 'string' && { amount: parsed }),
      ...(date === '' && { date: 'Вкажіть дату' }),
    };
    setErrors(next);
    if (typeof parsed !== 'number' || date === '') return;
    receive.mutate(
      { id: occurrence.id, input: { amount: parsed, date, ...(accountId && { accountId }) } },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label={`Сума, ${currency}`} error={errors.amount}>
        <Input
          autoFocus
          inputMode="decimal"
          value={amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Дата надходження" error={errors.date}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Рахунок">
        <SelectField
          value={accountId}
          onChange={setAccountId}
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        />
      </Field>
      <ErrorText>{receive.isError && errorMessage(receive.error)}</ErrorText>
      <Actions pending={receive.isPending} label="Отримано" />
    </form>
  );
}

// --- «Змінити цього разу» ---

export function EditOccurrenceDialog(props: DialogProps) {
  const { occurrence } = props;
  return (
    <Shell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={occurrence ? `Змінити цього разу: ${occurrence.name}` : 'Змінити цього разу'}
      description="Зміна стосується лише цього надходження; джерело й інші надходження лишаються як були."
    >
      {occurrence && (
        <EditOccurrenceForm
          occurrence={occurrence}
          currency={props.currency}
          onDone={() => props.onOpenChange(false)}
        />
      )}
    </Shell>
  );
}

function EditOccurrenceForm({
  occurrence,
  currency,
  onDone,
}: {
  occurrence: Occurrence;
  currency: string;
  onDone: () => void;
}) {
  const update = useUpdateOccurrence();
  const [amount, setAmount] = useState(plannedAmountText(occurrence.plannedAmount, currency));
  const [date, setDate] = useState(occurrence.plannedDate);
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePositive(amount, currency);
    const next = {
      ...(typeof parsed === 'string' && { amount: parsed }),
      ...(date === '' && { date: 'Вкажіть дату' }),
    };
    setErrors(next);
    if (typeof parsed !== 'number' || date === '') return;
    update.mutate(
      { id: occurrence.id, patch: { plannedDate: date, plannedAmount: parsed } },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Запланована дата" error={errors.date}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={`Запланована сума, ${currency}`} error={errors.amount}>
        <Input
          autoFocus
          inputMode="decimal"
          value={amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <ErrorText>{update.isError && errorMessage(update.error)}</ErrorText>
      <Actions pending={update.isPending} />
    </form>
  );
}

// --- «Платежі» ---

export function PaymentsDialog({ timeZone, ...props }: DialogProps & { timeZone: string }) {
  const { occurrence } = props;
  return (
    <Shell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={occurrence ? `Платежі: ${occurrence.name}` : 'Платежі'}
      description="Фактичні надходження за цим доходом. Помилковий запис можна видалити."
    >
      {occurrence && (
        <Payments occurrenceId={occurrence.id} currency={props.currency} timeZone={timeZone} />
      )}
    </Shell>
  );
}

function Payments({
  occurrenceId,
  currency,
  timeZone,
}: {
  occurrenceId: string;
  currency: string;
  timeZone: string;
}) {
  const payments = useTransactions({ occurrenceId, limit: 200 });
  const remove = useDeleteTransaction();

  if (payments.isError) return <ErrorText>{errorMessage(payments.error)}</ErrorText>;
  if (!payments.data) return <Muted>Завантаження…</Muted>;
  if (payments.data.items.length === 0) return <Muted>Платежів немає.</Muted>;

  return (
    <div className="space-y-2">
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      <ul className="divide-y text-sm">
        {payments.data.items.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-4 py-1">
            <span>
              {formatDate(payment.occurredAt, timeZone)} ·{' '}
              <span className="tabular-nums">
                {formatMoney({ amountMinor: payment.amountMinor, currency })}
              </span>
            </span>
            <ConfirmButton
              title="Видалити цей платіж?"
              description="Надходження знову стане неотриманим або отриманим частково."
              disabled={remove.isPending}
              onConfirm={() => remove.mutate(payment.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
