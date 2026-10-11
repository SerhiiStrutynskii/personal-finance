import type { Account } from '@hf/shared';
import { errorMessage } from '../../shared/api/index.ts';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import { useCurrentUser } from '../auth/authContext.ts';
import { AddTransferDialog } from './AddTransferDialog.tsx';
import { useTransactions } from './api.ts';
import { TransactionTable } from './TransactionTable.tsx';

/** Останні перекази між рахунками й кнопка нового переказу. */
export function TransfersSection({ accounts }: { accounts: Account[] }) {
  const { user } = useCurrentUser();
  const transfers = useTransactions({ type: 'transfer', limit: 20 });

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Перекази між рахунками</h2>
        <AddTransferDialog accounts={accounts} />
      </div>
      {accounts.length < 2 && <Muted>Для переказу потрібно щонайменше два рахунки.</Muted>}

      <ErrorText>{transfers.isError && errorMessage(transfers.error)}</ErrorText>
      {accounts.length >= 2 && transfers.data?.total === 0 && <Muted>Переказів ще немає</Muted>}
      {transfers.data && transfers.data.total > 0 && (
        <>
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
        </>
      )}
    </section>
  );
}
