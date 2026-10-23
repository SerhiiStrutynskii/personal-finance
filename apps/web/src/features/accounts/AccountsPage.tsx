import { formatMoney, type Account } from '@hf/shared';
import { Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { ListRow } from '../../shared/ui/list-row.tsx';
import { useIsOwner } from '../auth/authContext.ts';
import { useDebts } from '../debts/api.ts';
import { TransfersSection } from '../transactions/TransfersSection.tsx';
import { AddAccountDialog } from './AddAccountDialog.tsx';
import { AdjustBalanceDialog } from './AdjustBalanceDialog.tsx';
import { ACCOUNT_TYPE_LABELS, useAccounts, useDeleteAccount } from './api.ts';

export function AccountsPage() {
  const accounts = useAccounts();
  const remove = useDeleteAccount();
  const debts = useDebts();
  const isOwner = useIsOwner();
  // Рахунок кредитки → її борг: баланс картки звіряється на сторінці боргу.
  const cardDebts = new Map(
    (debts.data?.debts ?? []).flatMap((debt) =>
      debt.accountId ? [[debt.accountId, debt.id] as const] : [],
    ),
  );

  return (
    <div>
      <PageHeader title="Рахунки" action={isOwner && <AddAccountDialog />} />
      <ErrorText>{accounts.isError && errorMessage(accounts.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>

      {!accounts.data && !accounts.isError && <Muted>Завантаження…</Muted>}
      {accounts.data?.length === 0 && (
        <Muted>
          {isOwner
            ? 'Рахунків ще немає. Додайте перший кнопкою вгорі.'
            : 'Рахунків ще немає. Їх додає власник домогосподарства.'}
        </Muted>
      )}

      {accounts.data && accounts.data.length > 0 && (
        <ul className="max-w-3xl divide-y text-sm">
          {accounts.data.map((account) => (
            <ListRow
              key={account.id}
              className="items-center py-2"
              meta={[
                ACCOUNT_TYPE_LABELS[account.type],
                account.currency,
                account.isArchived && 'в архіві',
              ]
                .filter(Boolean)
                .join(' · ')}
              amount={
                <span data-testid="account-balance">
                  {formatMoney({ amountMinor: account.balance, currency: account.currency })}
                </span>
              }
              actions={
                isOwner && (
                  <div className="flex items-center gap-1">
                    <BalanceAction account={account} debtId={cardDebts.get(account.id)} />
                    <ConfirmButton
                      title={`Видалити рахунок «${account.name}»?`}
                      disabled={remove.isPending}
                      onConfirm={() => remove.mutate(account.id)}
                    />
                  </div>
                )
              }
            >
              {account.name}
            </ListRow>
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
      <Link to={debtId ? `/debts/${debtId}` : '/debts'} title="Звірити в боргах">
        <Scale />
        {/* На телефоні лише іконка: текст не вміщався поруч із сумою. */}
        <span className="max-sm:sr-only">Звірити в боргах</span>
      </Link>
    </Button>
  );
}
