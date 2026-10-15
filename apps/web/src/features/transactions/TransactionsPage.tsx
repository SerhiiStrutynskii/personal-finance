import {
  budgetPeriod,
  getAllowedExpenseDateRange,
  localMonthKey,
  type Transaction,
} from '@hf/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { MonthSwitcher } from '../../shared/ui/month-switcher.tsx';
import { activeAccounts, useAccounts } from '../accounts/api.ts';
import { defaultEntryDate } from '../budget/month.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { useTransactions } from './api.ts';
import { ENTRY_CONFIG, type EntryType } from './config.ts';
import { TransactionDialog } from './TransactionDialog.tsx';
import { TransactionTable } from './TransactionTable.tsx';
import { Button } from '../../shared/ui/button.tsx';

const PAGE_SIZE = 50;

export function TransactionsPage({ type }: { type: EntryType }) {
  const config = ENTRY_CONFIG[type];
  const { user } = useCurrentUser();
  // Список показує один місяць: спершу поточний, назад можна гортати, у майбутнє — ні.
  const currentMonth = localMonthKey(new Date(), user.timeZone);
  const [month, setMonth] = useState(currentMonth);
  const [offset, setOffset] = useState(0);
  // Запис зберігається й після закриття, щоб заголовок вікна не змінювався під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; original?: Transaction }>({ open: false });

  const accounts = useAccounts();
  const categories = useCategories();
  const period = budgetPeriod(month, user.timeZone);
  const transactions = useTransactions({
    type,
    from: period.start.toISOString(),
    to: period.end.toISOString(),
    limit: PAGE_SIZE,
    offset,
  });

  const error = transactions.error ?? accounts.error ?? categories.error;
  const page = transactions.data;
  const usableAccounts = activeAccounts(accounts.data);
  const hasAccounts = usableAccounts.length > 0;
  const entryCategories = (categories.data ?? []).filter((category) => category.kind === type);
  // Видаток не може мати майбутню дату; для прибутків меж немає.
  const expenseRange =
    type === 'expense' ? getAllowedExpenseDateRange(new Date(), user.timeZone) : undefined;

  return (
    <div>
      <PageHeader
        title={config.title}
        action={
          <div className="flex items-center gap-3">
            <MonthSwitcher
              month={month}
              max={currentMonth}
              onChange={(next) => {
                setMonth(next);
                setOffset(0);
              }}
            />
            {hasAccounts && <Button onClick={() => setDialog({ open: true })}>Додати</Button>}
          </div>
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
      {type === 'expense' && (
        <Muted>Видаток можна додати на сьогодні або будь-яку минулу дату.</Muted>
      )}

      {page && page.total > 0 && (
        <>
          <TransactionTable
            items={page.items}
            accounts={accounts.data ?? []}
            categories={categories.data ?? []}
            timeZone={user.timeZone}
            onEdit={(original) => setDialog({ open: true, original })}
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

      <TransactionDialog
        type={type}
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        original={dialog.original}
        maxDate={expenseRange?.maxDate}
        // Новий запис потрапляє в місяць, який зараз переглядається.
        defaults={{ date: defaultEntryDate(month, new Date(), user.timeZone) }}
        accounts={usableAccounts}
        categories={entryCategories}
      />
    </div>
  );
}
