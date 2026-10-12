import {
  budgetPeriod,
  getAllowedExpenseDateRange,
  getPeriodState,
  localMonthKey,
  shiftMonth,
  type BudgetView,
} from '@hf/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { monthLabel } from '../../shared/ui/format.ts';
import { MonthSwitcher } from '../../shared/ui/month-switcher.tsx';
import { activeAccounts, useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { TransactionDialog } from '../transactions/TransactionDialog.tsx';
import { AddLimitDialog } from './AddLimitDialog.tsx';
import { useBudget, useCreateBudget, useDeleteExpenseLine } from './api.ts';
import { BudgetSummary } from './BudgetSummary.tsx';
import { ExpenseSection } from './ExpenseSection.tsx';
import { IncomeSection } from './IncomeSection.tsx';

type ExpenseLine = BudgetView['expenseLines'][number];

export function BudgetPage() {
  const { user } = useCurrentUser();
  const accounts = useAccounts();
  const categories = useCategories();
  const [month, setMonth] = useState(() => localMonthKey(new Date(), user.timeZone));
  const budget = useBudget(month);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const accountList = activeAccounts(accounts.data);
  const expenseCategories = (categories.data ?? []).filter(
    (category) => category.kind === 'expense',
  );
  // Те саме вікно, що й на сторінці видатків. Кнопка є лише в поточному місяці, тож і дату
  // обмежено ним: інакше видаток не з'явився б у бюджеті, з якого його додали.
  const expenseRange = getAllowedExpenseDateRange(new Date(), user.timeZone);
  // Чи показувати кнопку, вирішує бекенд; саме правило ще раз перевіряє API видатків.
  const canAddExpense = budget.data?.canAddExpense === true && accountList.length > 0;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Бюджет"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MonthSwitcher month={month} onChange={setMonth} />
            {canAddExpense && (
              <Button onClick={() => setExpenseOpen(true)}>
                <Plus />
                Видаток
              </Button>
            )}
          </div>
        }
      />

      <ErrorText>{budget.isError && errorMessage(budget.error)}</ErrorText>
      <ErrorText>
        {(accounts.error ?? categories.error) && 'Не вдалося завантажити довідники'}
      </ErrorText>
      {budget.isPending && <Muted>Завантаження…</Muted>}
      {budget.data === null && <EmptyBudget month={month} timeZone={user.timeZone} />}
      {budget.data && budget.data.canAddExpense && accounts.data && accountList.length === 0 && (
        <Muted>
          Щоб додавати видатки, спершу{' '}
          <Link className="underline" to="/accounts">
            створіть рахунок
          </Link>
          .
        </Muted>
      )}
      {/* key скидає стан вікон при переході на інший місяць */}
      {budget.data && (
        <BudgetContent key={budget.data.id} budget={budget.data} categories={expenseCategories} />
      )}

      <TransactionDialog
        type="expense"
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        minDate={`${month}-01`}
        maxDate={expenseRange.maxDate}
        accounts={accountList}
        categories={expenseCategories}
      />
    </div>
  );
}

function EmptyBudget({ month, timeZone }: { month: string; timeZone: string }) {
  const create = useCreateBudget();
  const period = budgetPeriod(month, timeZone);
  const isPast = getPeriodState(period.start, period.end, new Date()) === 'past';
  const label = monthLabel(month).toLowerCase();

  if (isPast) {
    return (
      <div className="rounded-lg border border-dashed p-6" data-testid="budget-empty">
        <p>
          Бюджету на {label} не було. Створити бюджет можна лише для поточного або майбутнього
          місяця.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-6" data-testid="budget-empty">
      <p>Бюджету на {label} ще немає.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={create.isPending} onClick={() => create.mutate({ month })}>
          Створити
        </Button>
        <Button
          variant="outline"
          disabled={create.isPending}
          onClick={() => create.mutate({ month, copyFrom: shiftMonth(month, -1) })}
        >
          Скопіювати ліміти з попереднього
        </Button>
      </div>
      <ErrorText>{create.isError && errorMessage(create.error)}</ErrorText>
    </div>
  );
}

function BudgetContent({
  budget,
  categories,
}: {
  budget: BudgetView;
  categories: React.ComponentProps<typeof AddLimitDialog>['categories'];
}) {
  const deleteExpenseLine = useDeleteExpenseLine(budget.id);

  // Вміст вікон зберігається й після закриття, щоб не змінюватися під час анімації.
  const [limitDialog, setLimitDialog] = useState<{ open: boolean; categoryId?: string }>({
    open: false,
  });
  const [deletion, setDeletion] = useState<{ open: boolean; line?: ExpenseLine }>({ open: false });

  return (
    <>
      {budget.periodState === 'past' && (
        <Muted>Цей місяць минув: бюджет доступний лише для перегляду.</Muted>
      )}
      <ErrorText>{deleteExpenseLine.isError && errorMessage(deleteExpenseLine.error)}</ErrorText>

      <BudgetSummary budget={budget} />

      <ExpenseSection
        budget={budget}
        onAddLimit={(categoryId) =>
          setLimitDialog({ open: true, ...(categoryId && { categoryId }) })
        }
        onDeleteLine={(line) => setDeletion({ open: true, line })}
      />

      <IncomeSection budget={budget} />

      <AddLimitDialog
        open={limitDialog.open}
        onOpenChange={(open) => setLimitDialog({ ...limitDialog, open })}
        budget={budget}
        categories={categories}
        defaultCategoryId={limitDialog.categoryId}
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
