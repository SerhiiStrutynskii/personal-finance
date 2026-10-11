import { errorMessage } from '../../shared/api/index.ts';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { TransfersSection } from '../transactions/TransfersSection.tsx';
import { AddAccountDialog } from './AddAccountDialog.tsx';
import { ACCOUNT_TYPE_LABELS, useAccounts, useDeleteAccount } from './api.ts';

export function AccountsPage() {
  const accounts = useAccounts();
  const remove = useDeleteAccount();

  return (
    <div>
      <PageHeader title="Рахунки" action={<AddAccountDialog />} />
      <ErrorText>{accounts.isError && errorMessage(accounts.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>

      {!accounts.data && !accounts.isError && <Muted>Завантаження…</Muted>}
      {accounts.data?.length === 0 && (
        <Muted>Рахунків ще немає. Додайте перший кнопкою вгорі.</Muted>
      )}

      {accounts.data && accounts.data.length > 0 && (
        <ul className="max-w-3xl divide-y text-sm">
          {accounts.data.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 py-2">
              <span>
                {account.name}{' '}
                <span className="text-muted-foreground">
                  · {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}
                </span>
              </span>
              <ConfirmButton
                title={`Видалити рахунок «${account.name}»?`}
                disabled={remove.isPending}
                onConfirm={() => remove.mutate(account.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {accounts.data && <TransfersSection key={accounts.data.length} accounts={accounts.data} />}
    </div>
  );
}
