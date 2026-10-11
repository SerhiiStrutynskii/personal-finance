import { localMonthKey, shiftMonth, type BudgetView, type Transaction } from '@hf/shared';
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
import { useTransactions } from '../transactions/api.ts';
import type { EntryType } from '../transactions/config.ts';
import { TransactionDialog } from '../transactions/TransactionDialog.tsx';
import type { TransactionFormValues } from '../transactions/transactionForm.ts';
import { TransactionTable } from '../transactions/TransactionTable.tsx';
import {
  useBudget,
  useCreateBudget,
  useDeleteExpenseLine,
  useDeleteIncomeLine,
  useSetBudgetStatus,
} from './api.ts';
import { BudgetSummary } from './BudgetSummary.tsx';
import { ExpenseSection } from './ExpenseSection.tsx';
import { IncomeSection } from './IncomeSection.tsx';
import { ExpenseLineDialog, IncomeLineDialog } from './LineDialogs.tsx';
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

type EntryDialogState = {
  open: boolean;
  type: EntryType;
  original?: Transaction | undefined;
  defaults?: Partial<TransactionFormValues> | undefined;
};

type LineTarget =
  | { kind: 'income'; line?: BudgetView['incomeLines'][number] | undefined }
  | { kind: 'expense'; line?: BudgetView['expenseLines'][number] | undefined };

function BudgetContent({ budget }: { budget: BudgetView }) {
  const { user } = useCurrentUser();
  const accounts = useAccounts();
  const categories = useCategories();
  const incomes = useTransactions({
    type: 'income',
    from: budget.periodStart,
    to: budget.periodEnd,
    limit: 200,
  });
  const setStatus = useSetBudgetStatus(budget.id);
  const deleteIncomeLine = useDeleteIncomeLine(budget.id);
  const deleteExpenseLine = useDeleteExpenseLine(budget.id);

  // Вміст вікон зберігається й після закриття, щоб не змінюватися під час анімації.
  const [entry, setEntry] = useState<EntryDialogState>({ open: false, type: 'expense' });
  const [lineDialog, setLineDialog] = useState<{ open: boolean; target: LineTarget }>({
    open: false,
    target: { kind: 'income' },
  });
  const [deletion, setDeletion] = useState<{ open: boolean; target?: Required<LineTarget> }>({
    open: false,
  });

  const editable = budget.status !== 'closed';
  const accountList = accounts.data ?? [];
  const categoryList = categories.data ?? [];
  const canAddTransactions = accountList.length > 0;

  const openEntry = (type: EntryType, defaults: Partial<TransactionFormValues>) =>
    setEntry({
      open: true,
      type,
      defaults: { date: defaultEntryDate(budget.month, new Date(), user.timeZone), ...defaults },
    });

  const error =
    accounts.error ??
    categories.error ??
    incomes.error ??
    setStatus.error ??
    deleteIncomeLine.error ??
    deleteExpenseLine.error;

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
          Щоб додавати доходи й витрати, спершу{' '}
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
        onAddLine={() => setLineDialog({ open: true, target: { kind: 'expense' } })}
        onEditLine={(line) => setLineDialog({ open: true, target: { kind: 'expense', line } })}
        onDeleteLine={(line) => setDeletion({ open: true, target: { kind: 'expense', line } })}
        onAddExpense={(categoryId) => openEntry('expense', { categoryId: categoryId ?? '' })}
      />

      <IncomeSection
        budget={budget}
        editable={editable}
        canAddTransactions={canAddTransactions}
        onAddLine={() => setLineDialog({ open: true, target: { kind: 'income' } })}
        onEditLine={(line) => setLineDialog({ open: true, target: { kind: 'income', line } })}
        onDeleteLine={(line) => setDeletion({ open: true, target: { kind: 'income', line } })}
        onAddIncome={(incomeLineId) => openEntry('income', { incomeLineId: incomeLineId ?? '' })}
        records={
          incomes.data &&
          incomes.data.total > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="font-heading font-semibold">Записи доходів за місяць</h3>
              <TransactionTable
                items={incomes.data.items}
                accounts={accountList}
                categories={categoryList}
                timeZone={user.timeZone}
                onEdit={(original) => setEntry({ open: true, type: 'income', original })}
              />
            </div>
          )
        }
      />

      <TransactionDialog
        type={entry.type}
        open={entry.open}
        onOpenChange={(open) => setEntry({ ...entry, open })}
        original={entry.original}
        defaults={entry.defaults}
        incomeLines={budget.incomeLines}
        accounts={accountList}
        categories={categoryList.filter((category) => category.kind === entry.type)}
      />

      <IncomeLineDialog
        open={lineDialog.open && lineDialog.target.kind === 'income'}
        onOpenChange={(open) => setLineDialog({ ...lineDialog, open })}
        budget={budget}
        line={lineDialog.target.kind === 'income' ? lineDialog.target.line : undefined}
      />
      <ExpenseLineDialog
        open={lineDialog.open && lineDialog.target.kind === 'expense'}
        onOpenChange={(open) => setLineDialog({ ...lineDialog, open })}
        budget={budget}
        line={lineDialog.target.kind === 'expense' ? lineDialog.target.line : undefined}
        categories={categoryList.filter((category) => category.kind === 'expense')}
      />

      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={
          deletion.target?.kind === 'income'
            ? `Видалити статтю «${deletion.target.line.name}»?`
            : `Видалити ліміт «${deletion.target?.line.categoryName ?? ''}»?`
        }
        description={
          deletion.target?.kind === 'income'
            ? 'Записи доходів лишаться й перейдуть в «Інші доходи».'
            : 'Витрати цієї категорії лишаться й стануть незапланованими.'
        }
        onConfirm={() => {
          const target = deletion.target;
          if (target?.kind === 'income') deleteIncomeLine.mutate(target.line.id);
          else if (target) deleteExpenseLine.mutate(target.line.id);
        }}
      />
    </>
  );
}
