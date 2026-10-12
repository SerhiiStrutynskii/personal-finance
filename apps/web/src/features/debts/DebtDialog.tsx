import { formatMoney, type Debt, type UpdateDebtInput } from '@hf/shared';
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
import { monthLabel } from '../../shared/ui/format.ts';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { activeAccounts, useAccounts } from '../accounts/api.ts';
import { useSaveDebt, type CreateDebtBody } from './api.ts';
import {
  FIRST_PAYMENT_BY_SCHEDULE,
  NEW_CARD_ACCOUNT,
  firstPaymentMonths,
  initialDebtValues,
  previewProjection,
  toCreateInput,
  toUpdateInput,
  withType,
  type DebtFormErrors,
  type DebtFormValues,
} from './debtForm.ts';
import {
  DEBT_TYPES,
  DEBT_TYPE_LABELS,
  RATE_PERIODS,
  RATE_PERIOD_LABELS,
  type DebtType,
} from './labels.ts';
import { ProjectionInfo } from './ProjectionInfo.tsx';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Сьогоднішня дата в часовому поясі домогосподарства. */
  today: string;
  /** Борг, умови якого змінюють; без нього створюється новий. */
  original?: Debt | undefined;
}

/** Модальне вікно створення боргу або зміни його умов. Керується ззовні. */
export function DebtDialog({ open, onOpenChange, today, original }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Вміст монтується при кожному відкритті, тому форма починається з актуальних значень. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{original ? 'Умови боргу' : 'Новий борг'}</DialogTitle>
          <DialogDescription>
            {original
              ? 'Зміна умов не змінює історію рухів. Тип, початкову суму й дату початку змінити не можна.'
              : 'Кредитна картка створює рахунок, з якого можна записувати видатки.'}
          </DialogDescription>
        </DialogHeader>
        <DebtForm today={today} original={original} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

const CURRENCY = 'UAH';

function DebtForm({
  today,
  original,
  onSaved,
}: {
  today: string;
  original: Debt | undefined;
  onSaved: () => void;
}) {
  const save = useSaveDebt();
  const accounts = useAccounts();
  const [values, setValues] = useState(() => initialDebtValues(today, original));
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const set = (patch: Partial<DebtFormValues>) => setValues({ ...values, ...patch });

  const isCard = values.type === 'credit_card';
  const bindsAccount = isCard && values.cardAccountId !== NEW_CARD_ACCOUNT;
  const uahAccounts = activeAccounts(accounts.data).filter(
    (account) => account.currency === CURRENCY,
  );
  // Карткою може стати звичайний рахунок; гасити борг можна з будь-якого рахунку, крім самої картки.
  const bindable = uahAccounts.filter((account) => account.type !== 'credit_card');
  const payable = uahAccounts.filter(
    (account) => account.id !== original?.accountId && account.id !== values.cardAccountId,
  );
  const projection = previewProjection(values, today, original);
  const invalid = (field: keyof DebtFormValues) => (errors[field] ? true : undefined);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = original ? toUpdateInput(values, original) : toCreateInput(values, today);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    save.mutate(
      original
        ? { id: original.id, input: result.input as UpdateDebtInput }
        : { input: result.input as CreateDebtBody },
      { onSuccess: onSaved },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label="Назва" error={errors.name}>
        <Input
          autoFocus
          value={values.name}
          aria-invalid={invalid('name')}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      {!original && (
        <Field label="Тип">
          <SelectField
            value={values.type}
            onChange={(type: DebtType) => setValues(withType(values, type))}
            options={DEBT_TYPES.map((value) => ({ value, label: DEBT_TYPE_LABELS[value] }))}
          />
        </Field>
      )}

      {isCard && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!original && (
            <Field label="Рахунок-картка">
              <SelectField
                value={values.cardAccountId}
                onChange={(cardAccountId) => set({ cardAccountId })}
                options={[
                  { value: NEW_CARD_ACCOUNT, label: 'Створити новий рахунок-картку' },
                  ...bindable.map((account) => ({
                    value: account.id,
                    label: `Прив’язати «${account.name}»`,
                  })),
                ]}
              />
            </Field>
          )}
          <Field label={`Кредитний ліміт, ${CURRENCY}`} error={errors.creditLimit}>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={values.creditLimit}
              aria-invalid={invalid('creditLimit')}
              onChange={(e) => set({ creditLimit: e.target.value })}
            />
          </Field>
        </div>
      )}
      {bindsAccount && (
        <Muted>
          Борг дорівнюватиме поточному від’ємному балансу рахунку, тому початкова сума не вводиться.
        </Muted>
      )}

      {!original && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!bindsAccount && (
            <Field label={`Сума боргу, ${CURRENCY}`} error={errors.initialAmount}>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={values.initialAmount}
                aria-invalid={invalid('initialAmount')}
                onChange={(e) => set({ initialAmount: e.target.value })}
              />
            </Field>
          )}
          <Field label="Дата початку" error={errors.startDate}>
            <Input
              type="date"
              max={today}
              value={values.startDate}
              aria-invalid={invalid('startDate')}
              onChange={(e) => set({ startDate: e.target.value })}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ставка, %" error={errors.interestRate}>
          <Input
            inputMode="decimal"
            placeholder="0"
            value={values.interestRate}
            aria-invalid={invalid('interestRate')}
            onChange={(e) => set({ interestRate: e.target.value })}
          />
        </Field>
        <Field label="Період ставки">
          <SelectField
            value={values.ratePeriod}
            onChange={(ratePeriod) => set({ ratePeriod })}
            options={RATE_PERIODS.map((value) => ({ value, label: RATE_PERIOD_LABELS[value] }))}
          />
        </Field>
        <Field
          label={isCard ? `Мінімальний платіж, ${CURRENCY}` : `Щомісячний платіж, ${CURRENCY}`}
          error={errors.monthlyPayment}
        >
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={values.monthlyPayment}
            aria-invalid={invalid('monthlyPayment')}
            onChange={(e) => set({ monthlyPayment: e.target.value })}
          />
        </Field>
        <Field label="День платежу" error={errors.paymentDay}>
          <Input
            inputMode="numeric"
            value={values.paymentDay}
            aria-invalid={invalid('paymentDay')}
            onChange={(e) => set({ paymentDay: e.target.value })}
          />
        </Field>
        <Field label="Перший платіж" error={errors.firstPaymentMonth}>
          <SelectField
            value={values.firstPaymentMonth}
            onChange={(firstPaymentMonth) => set({ firstPaymentMonth })}
            options={[
              { value: FIRST_PAYMENT_BY_SCHEDULE, label: 'Найближчий за графіком' },
              ...firstPaymentMonths(today, values.firstPaymentMonth).map((month) => ({
                value: month,
                label: monthLabel(month),
              })),
            ]}
          />
        </Field>
        <Field label={isCard ? 'Діє до (необов’язково)' : 'Виданий до'} error={errors.maturityDate}>
          <Input
            type="date"
            value={values.maturityDate}
            aria-invalid={invalid('maturityDate')}
            onChange={(e) => set({ maturityDate: e.target.value })}
          />
        </Field>
        <Field label="Гасити з рахунку" error={errors.defaultAccountId}>
          <SelectField
            value={values.defaultAccountId}
            onChange={(defaultAccountId) => set({ defaultAccountId })}
            options={[
              { value: '', label: 'Не вибрано' },
              ...payable.map((account) => ({
                value: account.id,
                label: `${account.name} · ${formatMoney({ amountMinor: account.balance, currency: account.currency })}`,
              })),
            ]}
          />
        </Field>
      </div>
      <Muted>
        Якщо платіж цього місяця вже зроблено або ще не настав, виберіть місяць першого платежу: до
        нього борг не потрапляє в платежі місяця.
      </Muted>

      {!isCard && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={values.earlyRepaymentAllowed}
            onChange={(e) => set({ earlyRepaymentAllowed: e.target.checked })}
          />
          Можливе дострокове погашення
        </label>
      )}

      <Field label="Опис" error={errors.description}>
        <Input
          maxLength={1000}
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      <div className="rounded-lg border p-3">
        <div className="mb-1 text-sm font-medium">Прогноз погашення</div>
        {projection ? (
          <ProjectionInfo
            projection={projection}
            maturityDate={values.maturityDate || null}
            currency={CURRENCY}
          />
        ) : (
          <Muted>Заповніть суму, ставку, платіж і день платежу.</Muted>
        )}
      </div>

      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <ErrorText>{accounts.isError && errorMessage(accounts.error)}</ErrorText>
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
