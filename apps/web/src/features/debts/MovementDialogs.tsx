import { formatMoney, type Account, type DebtDetails } from '@hf/shared';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
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
import {
  useAdjustDebt,
  useChargeCardFee,
  useChargeDebt,
  usePayCard,
  usePayDebt,
  usePaymentPreview,
} from './api.ts';
import { ProjectionInfo } from './ProjectionInfo.tsx';

export interface MovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: DebtDetails;
  /** Рахунки у валюті боргу, з яких можна платити; без архівних і без самої картки. */
  accounts: readonly Account[];
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

function Actions({ pending, label }: { pending: boolean; label: string }) {
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

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-status-over">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Сума платежу має бути більшою за нуль. */
function parsePositive(text: string, currency: string): number | string {
  const amount = parsePlannedAmount(text, currency);
  return amount === 0 ? 'Сума має бути більшою за нуль' : amount;
}

const accountOptions = (accounts: readonly Account[]) =>
  accounts.map((account) => ({
    value: account.id,
    label: `${account.name} · ${formatMoney({ amountMinor: account.balance, currency: account.currency })}`,
  }));

/** Попередження, що грошей на рахунку менше за суму: платіж лише фіксує факт і не блокується. */
function LowFunds({ account, amount }: { account: Account | undefined; amount: number | string }) {
  if (!account || typeof amount !== 'number' || account.balance >= amount) return null;
  return <Warning>На рахунку «{account.name}» менше коштів, ніж сума платежу.</Warning>;
}

function dateError(date: string, debt: DebtDetails, checkStart: boolean): string | undefined {
  if (date === '') return 'Вкажіть дату';
  if (date > debt.today) return 'Дата не може бути в майбутньому';
  if (checkStart && date < debt.startDate) return 'Дата не може бути раніше за початок боргу';
  return undefined;
}

// --- «Сплатити» (позика, розстрочка) ---

export function LoanPaymentDialog(props: MovementDialogProps) {
  return (
    <Shell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Сплатити: ${props.debt.name}`}
      description="Платіж зменшить баланс рахунку й залишок боргу та потрапить у бюджет як «Погашення боргів»."
    >
      <LoanPaymentForm {...props} onDone={() => props.onOpenChange(false)} />
    </Shell>
  );
}

function LoanPaymentForm({ debt, accounts, onDone }: MovementDialogProps & { onDone: () => void }) {
  const pay = usePayDebt();
  const { currency } = debt;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  // За замовчуванням — те, що лишилося сплатити цього місяця, інакше плановий платіж.
  const unpaid = Math.max(0, debt.month.required - debt.month.paid);
  const [amount, setAmount] = useState(
    plannedAmountText(Math.min(unpaid || debt.monthlyPayment, debt.balance), currency),
  );
  const [date, setDate] = useState(debt.today);
  const [accountId, setAccountId] = useState(
    accounts.find((account) => account.id === debt.defaultAccountId)?.id ?? accounts[0]?.id ?? '',
  );
  // Розбивку можна ввести з виписки банку; без цього береться пропонована.
  const [manualSplit, setManualSplit] = useState(false);
  const [interest, setInterest] = useState('');
  const [confirmEarly, setConfirmEarly] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; date?: string; interest?: string }>({});

  const parsed = parsePositive(amount, currency);
  const preview = usePaymentPreview(debt.id, typeof parsed === 'number' ? parsed : null);
  const account = accounts.find((item) => item.id === accountId);
  const needsConfirmation = preview.data?.requiresConfirmation === true;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const interestPart = manualSplit ? parsePlannedAmount(interest, currency) : undefined;
    const next = {
      ...(typeof parsed === 'string' && { amount: parsed }),
      ...(dateError(date, debt, true) && { date: dateError(date, debt, true) }),
      ...(typeof interestPart === 'string' && { interest: interestPart }),
      ...(typeof interestPart === 'number' &&
        typeof parsed === 'number' &&
        interestPart > parsed && { interest: 'Відсотки не можуть перевищувати суму платежу' }),
    };
    setErrors(next);
    if (Object.keys(next).length > 0 || typeof parsed !== 'number' || !accountId) return;
    pay.mutate(
      {
        id: debt.id,
        input: {
          accountId,
          amount: parsed,
          date,
          ...(typeof interestPart === 'number' && {
            interestPart,
            principalPart: parsed - interestPart,
          }),
          ...(confirmEarly && { confirmEarly: true }),
        },
      },
      { onSuccess: onDone },
    );
  }

  if (accounts.length === 0) {
    return <Muted>Щоб сплатити, потрібен рахунок у валюті {currency}.</Muted>;
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Рахунок">
        <SelectField value={accountId} onChange={setAccountId} options={accountOptions(accounts)} />
      </Field>
      <Field label={`Сума, ${currency}`} error={errors.amount}>
        <Input
          autoFocus
          inputMode="decimal"
          value={amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Дата" error={errors.date}>
        <Input
          type="date"
          min={debt.startDate}
          max={debt.today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <LowFunds account={account} amount={parsed} />

      {preview.data && typeof parsed === 'number' && (
        <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="payment-preview">
          {!manualSplit && (
            <p>
              Тіло боргу {money(preview.data.principalPart)}, відсотки{' '}
              {money(preview.data.interestPart)}.{' '}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => {
                  setManualSplit(true);
                  setInterest(plannedAmountText(preview.data.interestPart, currency));
                }}
              >
                Ввести з виписки
              </button>
            </p>
          )}
          <p>Залишок після платежу: {money(preview.data.balanceAfter)}.</p>
          {preview.data.isEarly &&
            preview.data.interestSaved !== null &&
            preview.data.interestSaved > 0 && (
              <p>Дострокове погашення заощадить {money(preview.data.interestSaved)} відсотків.</p>
            )}
          <ProjectionInfo
            projection={preview.data.projection}
            maturityDate={debt.maturityDate}
            currency={currency}
          />
        </div>
      )}
      {manualSplit && (
        <Field label={`З них відсотки, ${currency}`} error={errors.interest}>
          <Input
            inputMode="decimal"
            value={interest}
            aria-invalid={errors.interest ? true : undefined}
            onChange={(e) => setInterest(e.target.value)}
          />
        </Field>
      )}

      {needsConfirmation && (
        <div className="space-y-2">
          <Warning>
            Умови цього боргу не передбачають дострокового погашення: банк може нарахувати комісію
            або не зарахувати платіж.
          </Warning>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={confirmEarly}
              onChange={(e) => setConfirmEarly(e.target.checked)}
            />
            Платіж уже внесено, записати його
          </label>
        </div>
      )}

      <ErrorText>{pay.isError && errorMessage(pay.error)}</ErrorText>
      <Actions pending={pay.isPending || (needsConfirmation && !confirmEarly)} label="Сплатити" />
    </form>
  );
}

// --- «Погасити» (кредитка) ---

export function CardPaymentDialog(props: MovementDialogProps) {
  return (
    <Shell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Погасити: ${props.debt.name}`}
      description="Погашення — це переказ з іншого рахунку на картку. У бюджеті воно не рахується як витрата: покупки з картки вже враховані."
    >
      <CardPaymentForm {...props} onDone={() => props.onOpenChange(false)} />
    </Shell>
  );
}

function CardPaymentForm({ debt, accounts, onDone }: MovementDialogProps & { onDone: () => void }) {
  const pay = usePayCard();
  const { currency } = debt;
  const unpaid = Math.max(0, debt.month.required - debt.month.paid);
  const [amount, setAmount] = useState(plannedAmountText(unpaid || debt.balance, currency));
  const [date, setDate] = useState(debt.today);
  const [fromAccountId, setFromAccountId] = useState(
    accounts.find((account) => account.id === debt.defaultAccountId)?.id ?? accounts[0]?.id ?? '',
  );
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  const parsed = parsePositive(amount, currency);
  const account = accounts.find((item) => item.id === fromAccountId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = {
      ...(typeof parsed === 'string' && { amount: parsed }),
      ...(dateError(date, debt, false) && { date: dateError(date, debt, false) }),
    };
    setErrors(next);
    if (Object.keys(next).length > 0 || typeof parsed !== 'number' || !fromAccountId) return;
    pay.mutate(
      { id: debt.id, input: { fromAccountId, amount: parsed, date } },
      { onSuccess: onDone },
    );
  }

  if (accounts.length === 0) {
    return <Muted>Щоб погасити картку, потрібен інший рахунок у валюті {currency}.</Muted>;
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="З рахунку">
        <SelectField
          value={fromAccountId}
          onChange={setFromAccountId}
          options={accountOptions(accounts)}
        />
      </Field>
      <Field label={`Сума, ${currency}`} error={errors.amount}>
        <Input
          autoFocus
          inputMode="decimal"
          value={amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {unpaid > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAmount(plannedAmountText(unpaid, currency))}
          >
            Мінімальний платіж
          </Button>
        )}
        {debt.balance > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAmount(plannedAmountText(debt.balance, currency))}
          >
            Весь борг
          </Button>
        )}
      </div>
      <Field label="Дата" error={errors.date}>
        <Input
          type="date"
          max={debt.today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <LowFunds account={account} amount={parsed} />
      <ErrorText>{pay.isError && errorMessage(pay.error)}</ErrorText>
      <Actions pending={pay.isPending} label="Погасити" />
    </form>
  );
}

// --- «Нарахування» (позика) і «Відсотки / комісія» (кредитка) ---

export function ChargeDialog({ open, onOpenChange, debt }: Omit<MovementDialogProps, 'accounts'>) {
  const isCard = debt.type === 'credit_card';
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={isCard ? `Відсотки / комісія: ${debt.name}` : `Нарахування: ${debt.name}`}
      description={
        isCard
          ? 'Запишеться видатком з картки в категорії «Відсотки та комісії» і збільшить борг.'
          : 'Комісія, штраф або нараховані відсотки збільшують борг; гроші з рахунків не списуються.'
      }
    >
      <ChargeForm debt={debt} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function ChargeForm({ debt, onDone }: { debt: DebtDetails; onDone: () => void }) {
  const isCard = debt.type === 'credit_card';
  const chargeLoan = useChargeDebt();
  const chargeCard = useChargeCardFee();
  const charge = isCard ? chargeCard : chargeLoan;
  const { currency } = debt;
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(debt.today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePositive(amount, currency);
    const next = {
      ...(typeof parsed === 'string' && { amount: parsed }),
      ...(dateError(date, debt, !isCard) && { date: dateError(date, debt, !isCard) }),
    };
    setErrors(next);
    if (Object.keys(next).length > 0 || typeof parsed !== 'number') return;
    charge.mutate(
      { id: debt.id, input: { amount: parsed, date, note: note.trim() || null } },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
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
        <Input
          type="date"
          min={isCard ? undefined : debt.startDate}
          max={debt.today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field label="Примітка">
        <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText>{charge.isError && errorMessage(charge.error)}</ErrorText>
      <Actions pending={charge.isPending} label="Записати" />
    </form>
  );
}

// --- «Звірити залишок» ---

export function AdjustDialog({ open, onOpenChange, debt }: Omit<MovementDialogProps, 'accounts'>) {
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={`Звірити залишок: ${debt.name}`}
      description="Вкажіть фактичний борг за даними банку на сьогодні. Застосунок запише різницю, не змінюючи минулі записи; на бюджет звірка не впливає."
    >
      <AdjustForm debt={debt} onDone={() => onOpenChange(false)} />
    </Shell>
  );
}

function AdjustForm({ debt, onDone }: { debt: DebtDetails; onDone: () => void }) {
  const adjust = useAdjustDebt();
  const { currency } = debt;
  const [balance, setBalance] = useState(plannedAmountText(debt.balance, currency));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();

  const parsed = parsePlannedAmount(balance, currency);
  const difference = typeof parsed === 'number' ? parsed - debt.balance : 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(typeof parsed === 'string' ? parsed : undefined);
    if (typeof parsed !== 'number') return;
    adjust.mutate(
      { id: debt.id, input: { actualBalance: parsed, note: note.trim() || null } },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label={`Фактичний борг, ${currency}`} error={error}>
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
          Борг {difference > 0 ? 'збільшиться' : 'зменшиться'} на{' '}
          {formatMoney({ amountMinor: Math.abs(difference), currency })}.
        </Muted>
      )}
      <Field label="Примітка">
        <Input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText>{adjust.isError && errorMessage(adjust.error)}</ErrorText>
      <Actions pending={adjust.isPending} label="Звірити" />
    </form>
  );
}
