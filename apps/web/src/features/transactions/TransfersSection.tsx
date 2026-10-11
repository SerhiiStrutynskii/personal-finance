import type { Account } from '@hf/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button, ErrorText, Field, Muted } from '../../shared/ui/controls.tsx';
import { inputClass } from '../../shared/ui/styles.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useSaveTransaction, useTransactions } from './api.ts';
import { initialValues, toTransactionInput, type FormErrors } from './transactionForm.ts';
import { TransactionTable } from './TransactionTable.tsx';

/** Форма переказу між рахунками й останні перекази. Переказ не є ні витратою, ні доходом. */
export function TransfersSection({ accounts }: { accounts: Account[] }) {
  const { user } = useCurrentUser();
  const save = useSaveTransaction();
  const transfers = useTransactions({ type: 'transfer', limit: 20 });

  const context = () => ({ accounts, timeZone: user.timeZone, now: new Date() });
  const blank = () => initialValues(context(), { toAccountId: accounts[1]?.id ?? '' });
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<FormErrors>({});
  const set = (patch: Partial<typeof values>) => setValues({ ...values, ...patch });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = toTransactionInput('transfer', values, context());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate({ input: result.input }, { onSuccess: () => setValues(blank()) });
  }

  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name} ({account.currency})
    </option>
  ));

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold">Перекази між рахунками</h2>
      {accounts.length < 2 ? (
        <Muted>Для переказу потрібно щонайменше два рахунки.</Muted>
      ) : (
        <form
          className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={handleSubmit}
          noValidate
        >
          <Field label="З рахунку" error={errors.accountId}>
            <select
              className={inputClass}
              value={values.accountId}
              onChange={(e) => set({ accountId: e.target.value })}
            >
              {accountOptions}
            </select>
          </Field>
          <Field label="На рахунок" error={errors.toAccountId}>
            <select
              className={inputClass}
              value={values.toAccountId}
              onChange={(e) => set({ toAccountId: e.target.value })}
            >
              {accountOptions}
            </select>
          </Field>
          <Field label="Сума" error={errors.amount}>
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="0,00"
              value={values.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
          <Field label="Дата" error={errors.date}>
            <input
              className={inputClass}
              type="date"
              value={values.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Опис" error={errors.description}>
              <input
                className={inputClass}
                maxLength={500}
                value={values.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
            <Button type="submit" disabled={save.isPending}>
              Переказати
            </Button>
          </div>
        </form>
      )}

      <ErrorText>{transfers.isError && errorMessage(transfers.error)}</ErrorText>
      {transfers.data && transfers.data.total > 0 && (
        <div className="mt-4">
          <TransactionTable
            items={transfers.data.items}
            accounts={accounts}
            categories={[]}
            timeZone={user.timeZone}
          />
          {transfers.data.total > transfers.data.items.length && (
            <Muted>
              Показано останні {transfers.data.items.length} із {transfers.data.total}.
            </Muted>
          )}
        </div>
      )}
    </section>
  );
}
