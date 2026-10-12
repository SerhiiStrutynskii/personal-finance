import { formatMoney, type Goal } from '@hf/shared';
import {
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Archive,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { formatDateString, monthLabel, percentText } from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { activeAccounts, useAccounts } from '../accounts/api.ts';
import { useDebts } from '../debts/api.ts';
import { useArchiveGoal, useDeleteGoal, useGoals } from './api.ts';
import { ContributeDialog } from './ContributeDialog.tsx';
import { GoalDialog } from './GoalDialog.tsx';
import { GoalStateLabel } from './GoalStateLabel.tsx';
import { GOAL_CARD_CLASS, GOAL_KIND_LABELS } from './labels.ts';

type SavingsGoal = Extract<Goal, { kind: 'savings' }>;

export function GoalsPage() {
  const goals = useGoals();
  const accounts = useAccounts();
  const debts = useDebts();
  const archive = useArchiveGoal();
  const remove = useDeleteGoal();
  // Ціль зберігається й після закриття, щоб вміст вікна не змінювався під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; original?: Goal }>({ open: false });
  const [contribution, setContribution] = useState<{ open: boolean; goal?: SavingsGoal }>({
    open: false,
  });
  const [deletion, setDeletion] = useState<{ open: boolean; goal?: Goal }>({ open: false });

  const list = goals.data;
  const uahAccounts = activeAccounts(accounts.data).filter((account) => account.currency === 'UAH');
  const savingsAccounts = uahAccounts.filter((account) => account.type !== 'credit_card');
  const openDebts = (debts.data?.debts ?? []).filter(
    (debt) => debt.status === 'active' && debt.balance > 0,
  );
  const error = goals.error ?? accounts.error ?? debts.error ?? archive.error ?? remove.error;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Цілі"
        action={
          <Button onClick={() => setDialog({ open: true })}>
            <Plus />
            Ціль
          </Button>
        }
      />
      <ErrorText>{error && errorMessage(error)}</ErrorText>
      {goals.isPending && <Muted>Завантаження…</Muted>}
      {list && list.goals.length === 0 && (
        <Muted>
          Цілей ще немає. Додайте ціль накопичення або план виходу з боргів кнопкою вгорі.
        </Muted>
      )}

      {list && list.goals.length > 0 && (
        <ul className="space-y-3">
          {list.goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => setDialog({ open: true, original: goal })}
              onContribute={
                goal.kind === 'savings' ? () => setContribution({ open: true, goal }) : undefined
              }
              onArchive={() => archive.mutate(goal.id)}
              onDelete={() => setDeletion({ open: true, goal })}
            />
          ))}
        </ul>
      )}

      {list && (
        <>
          <GoalDialog
            open={dialog.open}
            onOpenChange={(open) => setDialog({ ...dialog, open })}
            today={list.today}
            accounts={savingsAccounts}
            debts={openDebts}
            original={dialog.original}
          />
          <ContributeDialog
            open={contribution.open}
            onOpenChange={(open) => setContribution({ ...contribution, open })}
            goal={contribution.goal}
            accounts={uahAccounts.filter((account) => account.id !== contribution.goal?.accountId)}
            today={list.today}
          />
        </>
      )}
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити ціль «${deletion.goal?.name ?? ''}»?`}
        description="Зникне лише ціль: рахунки, перекази й борги лишаться. Цю дію не можна скасувати."
        onConfirm={() => deletion.goal && remove.mutate(deletion.goal.id)}
      />
    </div>
  );
}

function GoalCard({
  goal,
  onEdit,
  onContribute,
  onArchive,
  onDelete,
}: {
  goal: Goal;
  onEdit: () => void;
  onContribute: (() => void) | undefined;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: goal.currency });
  const archived = goal.status === 'archived';
  const isSavings = goal.kind === 'savings';
  const Icon = isSavings ? PiggyBank : TrendingDown;

  return (
    <li
      className={`rounded-lg border p-4 text-sm ${archived ? 'border-border bg-muted/50' : GOAL_CARD_CLASS[goal.state]}`}
      data-testid="goal-card"
      data-state={goal.state}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {isSavings ? (
            <span className="font-medium">{goal.name}</span>
          ) : (
            <Link
              className="font-medium underline-offset-4 hover:underline"
              to={`/goals/${goal.id}`}
            >
              {goal.name}
            </Link>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Icon className="size-4" aria-hidden />
            {GOAL_KIND_LABELS[goal.kind]}
            {isSavings && ` · рахунок «${goal.accountName}»`}
            {!isSavings && ` · боргів: ${goal.debts.length}`}
            {archived && ' · в архіві'}
          </div>
          {goal.description && <p className="mt-1">{goal.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onContribute && !archived && (
            <Button variant="outline" size="sm" onClick={onContribute}>
              Поповнити
            </Button>
          )}
          {!isSavings && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/goals/${goal.id}`}>План погашення</Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Дії з ціллю «${goal.name}»`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                Змінити
              </DropdownMenuItem>
              {!archived && (
                <DropdownMenuItem onSelect={onArchive}>
                  <Archive />В архів
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Видалити
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex flex-wrap justify-between gap-2" data-testid="goal-progress">
          <span>
            {isSavings
              ? `Зібрано ${money(goal.saved)} з ${money(goal.targetAmount)}`
              : `Погашено ${money(goal.paid)} з ${money(goal.startBalance)}`}
          </span>
          <span className="tabular-nums">{percentText(goal.progress)}</span>
        </div>
        <Progress
          className="h-1.5"
          value={goal.progress * 100}
          aria-label={isSavings ? 'Зібрано від суми цілі' : 'Погашено від стартового боргу'}
        />
      </div>

      {!archived && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <GoalStateLabel goal={goal} />
          <span className="text-muted-foreground">
            {isSavings ? savingsHint(goal, money) : debtHint(goal, money)}
          </span>
        </div>
      )}
    </li>
  );
}

type Money = (amountMinor: number) => string;

function savingsHint(goal: SavingsGoal, money: Money): string {
  if (goal.state === 'achieved') return '';
  const parts = [`лишилося ${money(goal.remaining)}`];
  if (goal.pace !== null && goal.projectedMonth) {
    parts.push(
      `за темпу ${money(goal.pace)} на місяць — ${monthLabel(goal.projectedMonth).toLowerCase()}`,
    );
  } else {
    parts.push('темпу накопичення ще немає');
  }
  return parts.join(' · ');
}

function debtHint(goal: Extract<Goal, { kind: 'debt_payoff' }>, money: Money): string {
  if (goal.state === 'achieved') return '';
  const parts = [
    `лишилося ${money(goal.currentBalance)}`,
    `до ${formatDateString(goal.targetDate)}`,
  ];
  parts.push(
    goal.debtFreeMonth
      ? `за планом — ${monthLabel(goal.debtFreeMonth).toLowerCase()}`
      : 'за планом борги не погашаються',
  );
  return parts.join(' · ');
}
