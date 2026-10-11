import type { Account, Category, Transaction } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button, ErrorText, Field, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { buttonClass, inputClass } from '../../shared/ui/styles.ts';
import { useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { useSaveTransaction, useTransaction } from './api.ts';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { initialValues, toTransactionInput, type FormErrors } from './transactionForm.ts';

export function TransactionFormPage({ type }: { type: EntryType }) {
  const config = ENTRY_CONFIG[type];
  const { id } = useParams<{ id: string }>();
  const accounts = useAccounts();
  const categories = useCategories();
  const transaction = useTransaction(id);

  const error = accounts.error ?? categories.error ?? transaction.error;
  const loaded = accounts.data && categories.data && (!id || transaction.data);
  // Витрату не можна відкрити за адресою доходу і навпаки.
  const wrongType = transaction.data && transaction.data.type !== type;

  return (
    <div className="max-w-md">
      <PageHeader title={id ? config.editTitle : config.addTitle} />
      {error || wrongType ? (
        <ErrorText>{wrongType ? 'Запис не знайдено' : errorMessage(error)}</ErrorText>
      ) : !loaded ? (
        <Muted>Завантаження…</Muted>
      ) : (
        <TransactionForm
          key={transaction.data?.id ?? 'new'}
          type={type}
          original={transaction.data}
          accounts={accounts.data}
          categories={categories.data.filter((category) => category.kind === type)}
        />
      )}
    </div>
  );
}

interface FormProps {
  type: EntryType;
  original: Transaction | undefined;
  accounts: Account[];
  categories: Category[];
}

function TransactionForm({ type, original, accounts, categories }: FormProps) {
  const config = ENTRY_CONFIG[type];
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const save = useSaveTransaction();

  const context = () => ({ accounts, timeZone: user.timeZone, now: new Date(), original });
  const [values, setValues] = useState(() => initialValues(context()));
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
    save.mutate(
      { id: original?.id, input: result.input },
      { onSuccess: () => navigate(config.path) },
    );
  }

  if (accounts.length === 0) {
    return (
      <Muted>
        Спершу{' '}
        <Link className="underline" to="/accounts">
          створіть рахунок
        </Link>
        .
      </Muted>
    );
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <Field label={currency ? `Сума, ${currency}` : 'Сума'} error={errors.amount}>
        <input
          className={inputClass}
          inputMode="decimal"
          placeholder="0,00"
          autoFocus
          value={values.amount}
          onChange={(e) => set({ amount: e.target.value })}
        />
      </Field>
      <Field label="Рахунок" error={errors.accountId}>
        <select
          className={inputClass}
          value={values.accountId}
          onChange={(e) => set({ accountId: e.target.value })}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Категорія" error={errors.categoryId}>
        <select
          className={inputClass}
          value={values.categoryId}
          onChange={(e) => set({ categoryId: e.target.value })}
        >
          <option value="">Без категорії</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Дата" error={errors.date}>
        <input
          className={inputClass}
          type="date"
          value={values.date}
          onChange={(e) => set({ date: e.target.value })}
        />
      </Field>
      <Field label="Опис" error={errors.description}>
        <input
          className={inputClass}
          maxLength={500}
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          Зберегти
        </Button>
        <Link className={buttonClass('secondary')} to={config.path}>
          Скасувати
        </Link>
      </div>
    </form>
  );
}
