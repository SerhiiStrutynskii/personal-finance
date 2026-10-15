import { formatMoney, type Account, type Category, type Transaction } from '@hf/shared';
import { TriangleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { categoryOptions } from '../categories/tree.ts';
import { useSaveTransaction } from './api.ts';
import type { EntryType } from './config.ts';
import {
  cardAvailable,
  creditLimitExcess,
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

/** Кредитна картка у списку рахунків показується з доступним лімітом. */
function accountLabel(account: Account): string {
  const available = cardAvailable(account);
  if (available === null) return `${account.name} (${account.currency})`;
  const money = formatMoney({ amountMinor: available, currency: account.currency });
  return `${account.name} (кредитка, доступно ${money})`;
}

/** Поля витрати або прибутку для створення чи редагування запису. */
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

  const account = accounts.find((item) => item.id === values.accountId);
  const currency = account?.currency;
  // Перевищення кредитного ліміту лише показується: видаток з картки не блокується.
  const overLimit = type === 'expense' ? creditLimitExcess(account, values.amount, original) : 0;

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
          options={accounts.map((item) => ({ value: item.id, label: accountLabel(item) }))}
        />
      </Field>
      {overLimit > 0 && currency && (
        <p className="flex items-start gap-1.5 text-sm text-status-over" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Перевищення кредитного ліміту на {formatMoney({ amountMinor: overLimit, currency })}
          </span>
        </p>
      )}
      <Field label="Категорія" error={errors.categoryId}>
        <SelectField
          value={values.categoryId}
          onChange={(categoryId) => set({ categoryId })}
          options={[{ value: '', label: 'Без категорії' }, ...categoryOptions(categories)]}
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
