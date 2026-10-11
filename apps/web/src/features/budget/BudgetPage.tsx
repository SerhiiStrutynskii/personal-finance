import { localMonthKey, shiftMonth, type BudgetView } from '@hf/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Badge } from '../../shared/ui/badge.tsx';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { monthLabel } from '../../shared/ui/format.ts';
import { MonthSwitcher } from '../../shared/ui/month-switcher.tsx';
import { useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { TransactionDialog } from '../transactions/TransactionDialog.tsx';
import type { TransactionFormValues } from '../transactions/transactionForm.ts';
import { useBudget, useCreateBudget, useDeleteExpenseLine, useSetBudgetStatus } from './api.ts';
import { BudgetSummary } from './BudgetSummary.tsx';
import { ExpenseSection } from './ExpenseSection.tsx';
import { IncomeSection } from './IncomeSection.tsx';
import { ExpenseLineDialog } from './LineDialogs.tsx';
import { defaultEntryDate } from './month.ts';

const STATUS_LABELS: Record<BudgetView['status'], string> = {
  draft: 'Чернетка',
  active: 'Активний',
  closed: 'Закритий',
};

export function BudgetPage() {
  const { user } = useCurrentUser();
  const [month, setMonth] = useState(() => localMonthKey(new Date(), user.timeZone));
  const budget = useBudget(month);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Бюджет" action={<MonthSwitcher month={month} onChange={setMonth} />} />

      <ErrorText>{budget.isError && errorMessage(budget.error)}</ErrorText>
      {budget.isPending && <Muted>Завантаження…</Muted>}
      {budget.data === null && <EmptyBudget month={month} />}
      {/* key скидає стан вікон при переході на інший місяць */}
      {budget.data && <BudgetContent key={budget.data.id} budget={budget.data} />}
    </div>
  );
}

function EmptyBudget({ month }: { month: string }) {
  const create = useCreateBudget();
  const previous = shiftMonth(month, -1);

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-6">
      <p>Бюджету на {monthLabel(month).toLowerCase()} ще немає.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={create.isPending} onClick={() => create.mutate({ month })}>
          Створити
        </Button>
        <Button
          variant="outline"
          disabled={create.isPending}
          onClick={() => create.mutate({ month, copyFrom: previous })}
        >
          Скопіювати з попереднього
        </Button>
      </div>
      <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
    </div>
  );
}

type ExpenseLine = BudgetView['expenseLines'][number];

function BudgetContent({ budget }: { budget: BudgetView }) {
  const { user } = useCurrentUser();
  const accounts = useAccounts();
  const categories = useCategories();
  const setStatus = useSetBudgetStatus(budget.id);
  const deleteExpenseLine = useDeleteExpenseLine(budget.id);

  // Вміст вікон зберігається й після закриття, щоб не змінюватися під час анімації.
  const [entry, setEntry] = useState<{
    open: boolean;
    defaults?: Partial<TransactionFormValues>;
  }>({ open: false });
  const [lineDialog, setLineDialog] = useState<{ open: boolean; line?: ExpenseLine }>({
    open: false,
  });
  const [deletion, setDeletion] = useState<{ open: boolean; line?: ExpenseLine }>({ open: false });

  const editable = budget.status !== 'closed';
  const accountList = accounts.data ?? [];
  const expenseCategories = (categories.data ?? []).filter(
    (category) => category.kind === 'expense',
  );
  const canAddTransactions = accountList.length > 0;

  const error = accounts.error ?? categories.error ?? setStatus.error ?? deleteExpenseLine.error;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={editable ? 'secondary' : 'outline'} data-testid="budget-status">
          {STATUS_LABELS[budget.status]}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={setStatus.isPending}
          onClick={() => setStatus.mutate(editable ? 'closed' : 'active')}
        >
          {editable ? 'Закрити місяць' : 'Відкрити знову'}
        </Button>
        {!editable && <Muted>Ліміти закритого бюджету змінювати не можна.</Muted>}
      </div>

      <ErrorText>{error && errorMessage(error)}</ErrorText>
      {accounts.data && !canAddTransactions && (
        <Muted>
          Щоб додавати витрати, спершу{' '}
          <Link className="underline" to="/accounts">
            створіть рахунок
          </Link>
          .
        </Muted>
      )}

      <BudgetSummary budget={budget} />

      <ExpenseSection
        budget={budget}
        editable={editable}
        canAddTransactions={canAddTransactions}
        onAddLine={() => setLineDialog({ open: true })}
        onEditLine={(line) => setLineDialog({ open: true, line })}
        onDeleteLine={(line) => setDeletion({ open: true, line })}
        onAddExpense={(categoryId) =>
          setEntry({
            open: true,
            defaults: {
              date: defaultEntryDate(budget.month, new Date(), user.timeZone),
              categoryId: categoryId ?? '',
            },
          })
        }
      />

      <IncomeSection budget={budget} />

      <TransactionDialog
        type="expense"
        open={entry.open}
        onOpenChange={(open) => setEntry({ ...entry, open })}
        defaults={entry.defaults}
        accounts={accountList}
        categories={expenseCategories}
      />
      <ExpenseLineDialog
        open={lineDialog.open}
        onOpenChange={(open) => setLineDialog({ ...lineDialog, open })}
        budget={budget}
        line={lineDialog.line}
        categories={expenseCategories}
      />
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити ліміт «${deletion.line?.categoryName ?? ''}»?`}
        description="Витрати цієї категорії лишаться й стануть незапланованими."
        onConfirm={() => deletion.line && deleteExpenseLine.mutate(deletion.line.id)}
      />
    </>
  );
}
