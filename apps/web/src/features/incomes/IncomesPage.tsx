import {
  budgetPeriod,
  formatMoney,
  localMonthKey,
  monthSchema,
  type IncomesView,
  type Transaction,
} from '@hf/shared';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { formatDateString } from '../../shared/ui/format.ts';
import { MonthSwitcher } from '../../shared/ui/month-switcher.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { defaultEntryDate } from '../budget/month.ts';
import { useCategories } from '../categories/api.ts';
import { useDeleteTransaction, useTransactions } from '../transactions/api.ts';
import { TransactionDialog } from '../transactions/TransactionDialog.tsx';
import { useIncomes, useUpdateOccurrence } from './api.ts';
import { IncomeSummary } from './IncomeSummary.tsx';
import { EditOccurrenceDialog, PaymentsDialog, ReceiveDialog } from './OccurrenceDialogs.tsx';
import { OccurrenceList } from './OccurrenceList.tsx';
import type { Occurrence } from './occurrenceStyles.ts';
import { OneTimeDialog } from './OneTimeDialog.tsx';

export function IncomesPage() {
  const { user } = useCurrentUser();
  // Місяць можна передати в адресі (?month=2026-10) — так сюди веде екран бюджету.
  const [searchParams] = useSearchParams();
  const [month, setMonth] = useState(() => {
    const requested = monthSchema.safeParse(searchParams.get('month'));
    return requested.success ? requested.data : localMonthKey(new Date(), user.timeZone);
  });
  const incomes = useIncomes(month);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Доходи"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button variant="outline" asChild>
              <Link to="/incomes/sources">Джерела доходу</Link>
            </Button>
          </div>
        }
      />
      <ErrorText>{incomes.isError && errorMessage(incomes.error)}</ErrorText>
      {incomes.isPending && <Muted>Завантаження…</Muted>}
      {/* key скидає стан вікон при переході на інший місяць */}
      {incomes.data && <IncomesContent key={incomes.data.month} incomes={incomes.data} />}
    </div>
  );
}

type OccurrenceAction = 'receive' | 'edit' | 'payments';

function IncomesContent({ incomes }: { incomes: IncomesView }) {
  const { user } = useCurrentUser();
  const { currency, month } = incomes;
  const accounts = useAccounts();
  const categories = useCategories();
  const updateOccurrence = useUpdateOccurrence();
  const removeTransaction = useDeleteTransaction();
  // Повні записи разових доходів потрібні для вікна редагування.
  const period = budgetPeriod(month, user.timeZone);
  const transactions = useTransactions({
    type: 'income',
    from: period.start.toISOString(),
    to: period.end.toISOString(),
    limit: 200,
  });

  // Вміст вікон зберігається й після закриття, щоб не змінюватися під час анімації.
  const [action, setAction] = useState<{
    open: boolean;
    kind: OccurrenceAction;
    occurrence?: Occurrence;
  }>({ open: false, kind: 'receive' });
  const [oneTimeOpen, setOneTimeOpen] = useState(false);
  const [editing, setEditing] = useState<{ open: boolean; original?: Transaction }>({
    open: false,
  });
  const [deletion, setDeletion] = useState<{ open: boolean; id?: string; name?: string }>({
    open: false,
  });

  const incomeAccounts = (accounts.data ?? []).filter((account) => account.currency === currency);
  const incomeCategories = (categories.data ?? []).filter((category) => category.kind === 'income');
  const canAdd = incomeAccounts.length > 0;
  const openAction = (kind: OccurrenceAction) => (occurrence: Occurrence) =>
    setAction({ open: true, kind, occurrence });
  const dialogProps = (kind: OccurrenceAction) => ({
    open: action.open && action.kind === kind,
    onOpenChange: (open: boolean) => setAction({ ...action, open }),
    occurrence: action.occurrence,
    currency,
  });
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  const error =
    accounts.error ??
    categories.error ??
    transactions.error ??
    updateOccurrence.error ??
    removeTransaction.error;

  return (
    <>
      <ErrorText>{error && errorMessage(error)}</ErrorText>
      {accounts.data && !canAdd && (
        <Muted>
          Щоб записувати доходи, спершу{' '}
          <Link className="underline" to="/accounts">
            створіть рахунок
          </Link>{' '}
          у валюті {currency}.
        </Muted>
      )}

      <IncomeSummary incomes={incomes} />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Регулярні надходження</h2>
        <OccurrenceList
          occurrences={incomes.occurrences}
          currency={currency}
          onReceive={openAction('receive')}
          onEdit={openAction('edit')}
          onShowPayments={openAction('payments')}
          onToggleSkip={(occurrence) =>
            updateOccurrence.mutate({
              id: occurrence.id,
              patch: { status: occurrence.status === 'skipped' ? 'expected' : 'skipped' },
            })
          }
        />
        {incomes.occurrences.length === 0 && (
          <Muted>
            Регулярні доходи задаються на сторінці{' '}
            <Link className="underline" to="/incomes/sources">
              «Джерела доходу»
            </Link>
            .
          </Muted>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold">Разові доходи</h2>
          {canAdd && (
            <Button variant="outline" onClick={() => setOneTimeOpen(true)}>
              <Plus />
              разовий дохід
            </Button>
          )}
        </div>
        {incomes.oneTime.length === 0 ? (
          <Muted>Разових доходів цього місяця немає.</Muted>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Назва</TableHead>
                <TableHead className="text-right">Сума</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Дії</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomes.oneTime.map((item) => {
                const original = transactions.data?.items.find(
                  (transaction) => transaction.id === item.transactionId,
                );
                return (
                  <TableRow key={item.transactionId} data-testid="one-time-income">
                    <TableCell>{formatDateString(item.date)}</TableCell>
                    <TableCell className="whitespace-normal">{item.name || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(item.amount)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Дії із записом">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {original && (
                            <DropdownMenuItem onSelect={() => setEditing({ open: true, original })}>
                              <Pencil />
                              Змінити
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              setDeletion({ open: true, id: item.transactionId, name: item.name })
                            }
                          >
                            <Trash2 />
                            Видалити
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <ReceiveDialog {...dialogProps('receive')} accounts={incomeAccounts} today={incomes.today} />
      <EditOccurrenceDialog {...dialogProps('edit')} />
      <PaymentsDialog {...dialogProps('payments')} timeZone={user.timeZone} />

      <OneTimeDialog
        open={oneTimeOpen}
        onOpenChange={setOneTimeOpen}
        currency={currency}
        accounts={incomeAccounts}
        categories={incomeCategories}
        defaultDate={defaultEntryDate(month, new Date(), user.timeZone)}
      />
      <TransactionDialog
        type="income"
        open={editing.open}
        onOpenChange={(open) => setEditing({ ...editing, open })}
        original={editing.original}
        accounts={accounts.data ?? []}
        categories={incomeCategories}
      />
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити дохід «${deletion.name ?? ''}»?`}
        onConfirm={() => deletion.id && removeTransaction.mutate(deletion.id)}
      />
    </>
  );
}
