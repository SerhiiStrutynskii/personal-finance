import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button, ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { buttonClass } from '../../shared/ui/styles.ts';
import { useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { useTransactions } from './api.ts';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { TransactionTable } from './TransactionTable.tsx';

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
          hasAccounts && (
            <Link className={buttonClass()} to={`${config.path}/add`}>
              Додати
            </Link>
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
              <Link className={buttonClass('secondary')} to={`${config.path}/${transaction.id}`}>
                Змінити
              </Link>
            )}
          />
          {page.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Новіші
              </Button>
              <span className="text-black/60">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} із {page.total}
              </span>
              <Button
                variant="secondary"
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
