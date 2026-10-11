import { DEFAULT_CURRENCY, createAccountSchema, type Account } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button, ErrorText, Field, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { inputClass } from '../../shared/ui/styles.ts';
import { TransfersSection } from '../transactions/TransfersSection.tsx';
import { ACCOUNT_TYPE_LABELS, useAccounts, useCreateAccount, useDeleteAccount } from './api.ts';

const CURRENCIES = ['UAH', 'USD', 'EUR'];
const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as Account['type'][];

export function AccountsPage() {
  const accounts = useAccounts();
  const create = useCreateAccount();
  const remove = useDeleteAccount();

  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('card');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [nameError, setNameError] = useState<string>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createAccountSchema.safeParse({ name, type, currency });
    if (!parsed.success) {
      setNameError('Вкажіть назву до 100 символів');
      return;
    }
    setNameError(undefined);
    create.mutate(parsed.data, { onSuccess: () => setName('') });
  }

  function handleDelete(account: Account) {
    if (window.confirm(`Видалити рахунок «${account.name}»?`)) remove.mutate(account.id);
  }

  return (
    <div>
      <PageHeader title="Рахунки" />
      <ErrorText>{accounts.isError && errorMessage(accounts.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>

      {!accounts.data && !accounts.isError && <Muted>Завантаження…</Muted>}
      {accounts.data?.length === 0 && <Muted>Рахунків ще немає. Додайте перший нижче.</Muted>}

      {accounts.data && accounts.data.length > 0 && (
        <ul className="max-w-3xl divide-y divide-black/5 text-sm">
          {accounts.data.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 py-2">
              <span>
                {account.name}{' '}
                <span className="text-black/50">
                  · {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
                </span>
              </span>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => handleDelete(account)}
              >
                Видалити
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 grid max-w-3xl grid-cols-1 items-start gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={handleSubmit}
        noValidate
      >
        <Field label="Назва нового рахунку" error={nameError}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Тип">
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as Account['type'])}
          >
            {ACCOUNT_TYPES.map((value) => (
              <option key={value} value={value}>
                {ACCOUNT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Валюта">
          <select
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Button type="submit" className="sm:mt-6" disabled={create.isPending}>
          Додати
        </Button>
        <div className="sm:col-span-4">
          <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
        </div>
      </form>

      {accounts.data && <TransfersSection key={accounts.data.length} accounts={accounts.data} />}
    </div>
  );
}
