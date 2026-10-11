import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { AddTransactionDialog } from './AddTransactionDialog.tsx';
import { useTransactions } from './api.ts';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { TransactionTable } from './TransactionTable.tsx';
import { Button } from '../../shared/ui/button.tsx';

const PAGE_SIZE = 50;

export function TransactionsPage({ type }: { type: EntryType }) {
  const config = ENTRY_CONFIG[type];
  const { user } = useCurrentUser();
  const [offset, setOffset] = useState(0);

  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions({ type, limit: PAGE_SIZE, offset });

  const error = transactions.error ?? accounts.error ?? categories.error;
  const page = transactions.data;
  const hasAccounts = (accounts.data?.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={config.title}
        action={
          accounts.data &&
          categories.data &&
          hasAccounts && (
            <AddTransactionDialog
              type={type}
              accounts={accounts.data}
              categories={categories.data.filter((category) => category.kind === type)}
            />
          )
        }
      />
      <ErrorText>{error && errorMessage(error)}</ErrorText>

      {accounts.data && !hasAccounts && (
        <Muted>
          Щоб додавати записи, спершу{' '}
          <Link className="underline" to="/accounts">
            створіть рахунок
          </Link>
          .
        </Muted>
      )}

      {!page && !error && <Muted>Завантаження…</Muted>}
      {page && page.total === 0 && hasAccounts && <Muted>{config.empty}</Muted>}

      {page && page.total > 0 && (
        <>
          <TransactionTable
            items={page.items}
            accounts={accounts.data ?? []}
            categories={categories.data ?? []}
            timeZone={user.timeZone}
            renderActions={(transaction) => (
              <Button variant="outline" asChild>
                <Link to={`${config.path}/${transaction.id}`}>Змінити</Link>
              </Button>
            )}
          />
          {page.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Новіші
              </Button>
              <span className="text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} із {page.total}
              </span>
              <Button
                variant="outline"
                disabled={offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Старіші
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
