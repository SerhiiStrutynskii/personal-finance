import type { Account, Category, Transaction } from '@hf/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { useSaveTransaction } from './api.ts';
import type { EntryType } from './config.ts';
import {
  initialValues,
  toTransactionInput,
  type FormErrors,
  type TransactionFormValues,
} from './transactionForm.ts';

interface Props {
  type: EntryType;
  /** Транзакція, яку редагують; без неї форма створює нову. */
  original?: Transaction | undefined;
  accounts: Account[];
  /** Категорії того самого типу, що й транзакція. */
  categories: Category[];
  /** Початкові значення нового запису, наприклад категорія чи дата з екрана бюджету. */
  defaults?: Partial<TransactionFormValues> | undefined;
  /** Межі вибору дати (YYYY-MM-DD, включно); для видатків — поточний місяць до сьогодні. */
  minDate?: string | undefined;
  maxDate?: string | undefined;
  onSaved: () => void;
  /** Розміщує кнопку збереження поруч із власними діями (наприклад, «Скасувати»). */
  renderActions: (submit: ReactNode) => ReactNode;
}

/** Поля витрати або доходу для створення чи редагування запису. */
export function TransactionForm({
  type,
  original,
  accounts,
  categories,
  defaults,
  minDate,
  maxDate,
  onSaved,
  renderActions,
}: Props) {
  const { user } = useCurrentUser();
  const save = useSaveTransaction();

  const context = () => ({
    accounts,
    timeZone: user.timeZone,
    now: new Date(),
    original,
    minDate,
    maxDate,
  });
  const [values, setValues] = useState(() => initialValues(context(), defaults));
  const [errors, setErrors] = useState<FormErrors>({});
  const set = (patch: Partial<typeof values>) => setValues({ ...values, ...patch });

  const currency = accounts.find((account) => account.id === values.accountId)?.currency;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toTransactionInput(type, values, context());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate({ id: original?.id, input: result.input }, { onSuccess: onSaved });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <Field label={currency ? `Сума, ${currency}` : 'Сума'} error={errors.amount}>
        <Input
          inputMode="decimal"
          placeholder="0,00"
          autoFocus
          value={values.amount}
          aria-invalid={errors.amount ? true : undefined}
          onChange={(e) => set({ amount: e.target.value })}
        />
      </Field>
      <Field label="Рахунок" error={errors.accountId}>
        <SelectField
          value={values.accountId}
          onChange={(accountId) => set({ accountId })}
          invalid={Boolean(errors.accountId)}
          options={accounts.map((account) => ({
            value: account.id,
            label: `${account.name} (${account.currency})`,
          }))}
        />
      </Field>
      <Field label="Категорія" error={errors.categoryId}>
        <SelectField
          value={values.categoryId}
          onChange={(categoryId) => set({ categoryId })}
          options={[
            { value: '', label: 'Без категорії' },
            ...categories.map((category) => ({ value: category.id, label: category.name })),
          ]}
        />
      </Field>
      <Field label="Дата" error={errors.date}>
        <Input
          type="date"
          min={minDate}
          max={maxDate}
          value={values.date}
          aria-invalid={errors.date ? true : undefined}
          onChange={(e) => set({ date: e.target.value })}
        />
      </Field>
      <Field label="Опис" error={errors.description}>
        <Input
          maxLength={500}
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      {renderActions(
        <Button type="submit" disabled={save.isPending}>
          Зберегти
        </Button>,
      )}
    </form>
  );
}
