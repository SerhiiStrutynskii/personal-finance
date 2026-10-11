import type { Account, Category, Transaction } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { ErrorText, Field, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { useSaveTransaction, useTransaction } from './api.ts';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { initialValues, toTransactionInput, type FormErrors } from './transactionForm.ts';
import { Button } from '../../shared/ui/button.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';

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
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field label={currency ? `Сума, ${currency}` : 'Сума'} error={errors.amount}>
        <Input
          inputMode="decimal"
          placeholder="0,00"
          autoFocus
          value={values.amount}
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
        <Input type="date" value={values.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="Опис" error={errors.description}>
        <Input
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
        <Button variant="outline" asChild>
          <Link to={config.path}>Скасувати</Link>
        </Button>
      </div>
    </form>
  );
}
