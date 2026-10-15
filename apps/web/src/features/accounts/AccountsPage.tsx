import { formatMoney, type Account } from '@hf/shared';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useDebts } from '../debts/api.ts';
import { TransfersSection } from '../transactions/TransfersSection.tsx';
import { AddAccountDialog } from './AddAccountDialog.tsx';
import { AdjustBalanceDialog } from './AdjustBalanceDialog.tsx';
import { ACCOUNT_TYPE_LABELS, useAccounts, useDeleteAccount } from './api.ts';

export function AccountsPage() {
  const accounts = useAccounts();
  const remove = useDeleteAccount();
  const debts = useDebts();
  // Рахунок кредитки → її борг: баланс картки звіряється на сторінці боргу.
  const cardDebts = new Map(
    (debts.data?.debts ?? []).flatMap((debt) =>
      debt.accountId ? [[debt.accountId, debt.id] as const] : [],
    ),
  );

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
                  {account.isArchived && ' · в архіві'}
                </span>
              </span>
              <span className="ml-auto tabular-nums" data-testid="account-balance">
                {formatMoney({ amountMinor: account.balance, currency: account.currency })}
              </span>
              <BalanceAction account={account} debtId={cardDebts.get(account.id)} />
              <ConfirmButton
                title={`Видалити рахунок «${account.name}»?`}
                disabled={remove.isPending}
                onConfirm={() => remove.mutate(account.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {accounts.data && <TransfersSection accounts={accounts.data} />}
    </div>
  );
}

function BalanceAction({ account, debtId }: { account: Account; debtId: string | undefined }) {
  if (account.isArchived) return null;
  if (account.type !== 'credit_card') return <AdjustBalanceDialog account={account} />;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={debtId ? `/debts/${debtId}` : '/debts'}>Звірити в боргах</Link>
    </Button>
  );
}
