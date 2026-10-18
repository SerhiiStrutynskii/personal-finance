import { formatMoney, type Account } from '@hf/shared';
import { Pencil } from 'lucide-react';
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
  DialogTrigger,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { plannedAmountText } from '../budget/plannedAmount.ts';
import { useAdjustAccountBalance } from './api.ts';
import { parseActualBalance } from './openingBalance.ts';

/** Кнопка-іконка «Змінити баланс»: фактичний баланс на зараз, різниця записується коригуванням. */
export function AdjustBalanceDialog({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Змінити баланс «${account.name}»`}
          title={`Змінити баланс «${account.name}»`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      {/* Вміст монтується при кожному відкритті, тому форма починається з актуального балансу. */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Змінити баланс: ${account.name}`}</DialogTitle>
          <DialogDescription>
            Вкажіть, скільки грошей на рахунку зараз. Застосунок запише різницю, не змінюючи минулі
            записи; це не прибуток і не витрата, тож на бюджет коригування не впливає.
          </DialogDescription>
        </DialogHeader>
        <AdjustBalanceForm account={account} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AdjustBalanceForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const adjust = useAdjustAccountBalance();
  const { currency } = account;
  const [balance, setBalance] = useState(plannedAmountText(account.balance, currency));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();

  const parsed = parseActualBalance(balance, currency);
  const difference = typeof parsed === 'number' ? parsed - account.balance : 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(typeof parsed === 'string' ? parsed : undefined);
    if (typeof parsed !== 'number') return;
    adjust.mutate(
      { id: account.id, input: { actualBalance: parsed, note: note.trim() || null } },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label={`Фактичний баланс, ${currency}`} error={error}>
        <Input
          autoFocus
          inputMode="decimal"
          value={balance}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setBalance(e.target.value)}
        />
      </Field>
      {difference !== 0 && (
        <Muted>
          Баланс {difference > 0 ? 'збільшиться' : 'зменшиться'} на{' '}
          {formatMoney({ amountMinor: Math.abs(difference), currency })}.
        </Muted>
      )}
      <Field label="Примітка">
        <Input
          maxLength={500}
          placeholder="Коригування балансу"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <ErrorText>{adjust.isError && errorMessage(adjust.error)}</ErrorText>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Скасувати</Button>
        </DialogClose>
        <Button type="submit" disabled={adjust.isPending}>
          Зберегти
        </Button>
      </DialogFooter>
    </form>
  );
}
