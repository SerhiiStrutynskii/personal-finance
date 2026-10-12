import {
  formatMoney,
  getAllowedExpenseDateRange,
  type Dashboard,
  type Transaction,
} from '@hf/shared';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { formatDate, formatDayMonth, monthLabel, percentText } from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { ACCOUNT_TYPE_LABELS, activeAccounts, useAccounts } from '../accounts/api.ts';
import { signedMoney } from '../analytics/signedMoney.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCategories } from '../categories/api.ts';
import { GoalStateLabel } from '../goals/GoalStateLabel.tsx';
import { AddTransferDialog } from '../transactions/AddTransferDialog.tsx';
import type { EntryType } from '../transactions/config.ts';
import { TransactionDialog } from '../transactions/TransactionDialog.tsx';
import { useDashboard } from './api.ts';
import { ATTENTION_VIEW, UPCOMING_VIEW } from './attention.ts';

export function DashboardPage() {
  const { user, household } = useCurrentUser();
  const dashboard = useDashboard();
  const accounts = useAccounts();
  const categories = useCategories();
  // Вид вікна зберігається й після закриття, щоб заголовок не змінювався під час анімації.
  const [entry, setEntry] = useState<{ open: boolean; type: EntryType }>({
    open: false,
    type: 'expense',
  });

  const data = dashboard.data;
  const usableAccounts = activeAccounts(accounts.data);
  const error = dashboard.error ?? accounts.error ?? categories.error;
  // Видаток не може мати майбутню дату; для доходів меж немає.
  const maxDate =
    entry.type === 'expense'
      ? getAllowedExpenseDateRange(new Date(), user.timeZone).maxDate
      : undefined;
  const open = (type: EntryType) => () => setEntry({ open: true, type });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`Вітаємо, ${user.name}`}
        action={
          usableAccounts.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button onClick={open('expense')}>
                <Plus />
                Видаток
              </Button>
              <Button variant="outline" onClick={open('income')}>
                <Plus />
                Дохід
              </Button>
              <AddTransferDialog accounts={usableAccounts} />
            </div>
          )
        }
      />
      <Muted>
        {household.name}
        {data && ` · ${monthLabel(data.month)}`}
      </Muted>
      <ErrorText>{error && errorMessage(error)}</ErrorText>
      {dashboard.isPending && <Muted>Завантаження…</Muted>}

      {data && !data.setup.hasAccounts && <SetupSteps setup={data.setup} />}
      {data && data.setup.hasAccounts && (
        <>
          {!(data.setup.hasTransactions && data.setup.hasBudget) && (
            <SetupSteps setup={data.setup} />
          )}
          <MoneyBlock data={data} />
          <MonthBlock data={data} />
          <AttentionBlock data={data} />
          <UpcomingBlock data={data} />
          <GoalsBlock data={data} />
          <RecentBlock data={data} timeZone={user.timeZone} />
        </>
      )}

      <TransactionDialog
        type={entry.type}
        open={entry.open}
        onOpenChange={(next) => setEntry({ ...entry, open: next })}
        maxDate={maxDate}
        accounts={usableAccounts}
        categories={(categories.data ?? []).filter((category) => category.kind === entry.type)}
      />
    </div>
  );
}

function Block({
  title,
  to,
  testId,
  children,
}: {
  title: string;
  /** Розділ, на який веде заголовок блока. */
  to: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="font-heading text-lg font-semibold">
        <Link className="underline-offset-4 hover:underline" to={to}>
          {title}
        </Link>
      </h2>
      {children}
    </section>
  );
}

function Figure({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Кроки для нового користувача; виконаний крок позначено галочкою. */
function SetupSteps({ setup }: { setup: Dashboard['setup'] }) {
  const steps = [
    { done: setup.hasAccounts, to: '/accounts', text: 'Створіть рахунок' },
    { done: setup.hasTransactions, to: '/expenses', text: 'Додайте перший видаток або дохід' },
    { done: setup.hasBudget, to: '/budget', text: 'Складіть бюджет на місяць' },
  ];
  return (
    <Card data-testid="dashboard-setup">
      <CardContent className="space-y-2">
        <div className="font-medium">З чого почати</div>
        <ol className="space-y-1 text-sm">
          {steps.map((step, index) => (
            <li key={step.to} className="flex items-center gap-2" data-done={step.done}>
              {step.done ? (
                <Check className="size-4 text-status-surplus" aria-label="Виконано" />
              ) : (
                <span className="w-4 text-center text-muted-foreground">{index + 1}</span>
              )}
              {step.done ? (
                <span className="text-muted-foreground line-through">{step.text}</span>
              ) : (
                <Link className="underline underline-offset-4" to={step.to}>
                  {step.text}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function MoneyBlock({ data }: { data: Dashboard }) {
  const { money, currency } = data;
  const format = (amountMinor: number, code = currency) =>
    signedMoney(amountMinor, code).replace(/^\+/, '');
  return (
    <Block title="Гроші зараз" to="/accounts" testId="dashboard-money">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Figure
              title="Чисті активи"
              value={format(money.netWorth)}
              hint="рахунки в гривні мінус позики"
            />
            <Figure title="На рахунках" value={format(money.accountsTotal)} />
            <Figure title="Загальний борг" value={format(money.debtTotal)} />
          </div>
          <ul className="divide-y text-sm">
            {money.accounts.map((account) => (
              <li key={account.id} className="flex justify-between gap-4 py-1.5">
                <span>
                  {account.name}{' '}
                  <span className="text-muted-foreground">
                    · {ACCOUNT_TYPE_LABELS[account.type]}
                  </span>
                </span>
                <span className="tabular-nums">{format(account.balance, account.currency)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Block>
  );
}

function MonthBlock({ data }: { data: Dashboard }) {
  const { monthSummary: month, currency } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const planned = month.plannedExpenseTotal;
  const overPlan = planned !== null ? month.projected - planned : 0;

  return (
    <Block title="Цей місяць" to="/analytics" testId="dashboard-month">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Figure title="Дохід" value={money(month.income)} />
            <Figure title="Витрати" value={money(month.expenses)} />
            <Figure title="Різниця" value={signedMoney(month.net, currency)} />
          </div>
          {planned !== null && planned > 0 && (
            <div className="text-sm">
              <div className="mb-1 flex flex-wrap justify-between gap-2">
                <span>
                  Витрачено {money(month.expenses)} з {money(planned)} лімітів
                </span>
                <span className="tabular-nums">{percentText(month.expenses / planned)}</span>
              </div>
              <Progress
                className="h-1.5"
                value={Math.min(100, (month.expenses / planned) * 100)}
                aria-label="Витрачено від суми лімітів"
              />
            </div>
          )}
          {planned === null && (
            <Muted>
              На цей місяць немає бюджету.{' '}
              <Link className="underline underline-offset-4" to="/budget">
                Створити бюджет
              </Link>
            </Muted>
          )}
          <p className="text-sm text-muted-foreground">
            Прогноз на кінець місяця за поточного темпу: {money(month.projected)} (минуло{' '}
            {month.daysElapsed} з {month.daysInMonth} днів).
          </p>
          {overPlan > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-status-over">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>За такого темпу витрати перевищать суму лімітів на {money(overPlan)}.</span>
            </p>
          )}
        </CardContent>
      </Card>
    </Block>
  );
}

function AttentionBlock({ data }: { data: Dashboard }) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: data.currency });
  return (
    <Block title="Потребує уваги" to="/analytics" testId="dashboard-attention">
      {data.attention.length === 0 && (
        <p className="inline-flex items-center gap-1 text-sm font-medium text-status-surplus">
          <Check className="size-4" aria-hidden />
          Усе під контролем
        </p>
      )}
      <ul className="space-y-2">
        {data.attention.map((item) => {
          const view = ATTENTION_VIEW[item.kind];
          const Icon = view.icon;
          const tone = view.urgent
            ? 'border-status-over bg-status-over/10'
            : 'border-status-partial bg-status-partial/10';
          const text = view.urgent ? 'text-status-over' : 'text-status-partial';
          return (
            <li
              key={`${item.kind}-${item.id ?? 'none'}`}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${tone}`}
              data-testid="attention-item"
              data-kind={item.kind}
            >
              <span className={`inline-flex items-center gap-1 font-medium ${text}`}>
                <Icon className="size-4" aria-hidden />
                {view.label}
              </span>
              <Link className="underline-offset-4 hover:underline" to={view.link(item)}>
                {item.name}
              </Link>
              <span className="tabular-nums">
                {item.amount !== null && money(item.amount)}
                {item.amount !== null && item.date && ' · '}
                {item.date && formatDayMonth(item.date)}
              </span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function UpcomingBlock({ data }: { data: Dashboard }) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: data.currency });
  return (
    <Block title="Найближчі платежі й надходження" to="/debts" testId="dashboard-upcoming">
      {data.upcoming.length === 0 && <Muted>До кінця місяця нічого не заплановано.</Muted>}
      <ul className="divide-y text-sm">
        {data.upcoming.map((item) => {
          const view = UPCOMING_VIEW[item.kind];
          const Icon = view.icon;
          return (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              data-testid="upcoming-item"
            >
              <span className="inline-flex items-center gap-2">
                <span className="w-12 tabular-nums text-muted-foreground">
                  {formatDayMonth(item.date)}
                </span>
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <Link className="underline-offset-4 hover:underline" to={view.link(item.id)}>
                  {item.name}
                </Link>
                <span className="text-muted-foreground">· {view.label}</span>
              </span>
              <span className="tabular-nums">
                {item.kind === 'income' ? '+' : '−'}
                {money(item.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function GoalsBlock({ data }: { data: Dashboard }) {
  return (
    <Block title="Цілі" to="/goals" testId="dashboard-goals">
      {data.goals.length === 0 && (
        <Muted>
          Активних цілей немає.{' '}
          <Link className="underline underline-offset-4" to="/goals">
            Додати ціль
          </Link>
        </Muted>
      )}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.goals.map((goal) => {
          const money = (amountMinor: number) =>
            formatMoney({ amountMinor, currency: goal.currency });
          return (
            <li
              key={goal.id}
              className="rounded-lg border p-3 text-sm"
              data-testid="dashboard-goal"
            >
              <div className="font-medium">{goal.name}</div>
              <div className="mb-1 flex justify-between gap-2 text-muted-foreground">
                <span>
                  {goal.kind === 'savings'
                    ? `${money(goal.saved)} з ${money(goal.targetAmount)}`
                    : `погашено ${money(goal.paid)} з ${money(goal.startBalance)}`}
                </span>
                <span className="tabular-nums">{percentText(goal.progress)}</span>
              </div>
              <Progress
                className="mb-2 h-1.5"
                value={goal.progress * 100}
                aria-label="Прогрес цілі"
              />
              <GoalStateLabel goal={goal} />
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

const RECENT_SIGN: Record<Transaction['type'], string> = {
  income: '+',
  expense: '−',
  debt_payment: '−',
  transfer: '',
  balance_adjustment: '',
};

function RecentBlock({ data, timeZone }: { data: Dashboard; timeZone: string }) {
  return (
    <Block title="Останні операції" to="/expenses" testId="dashboard-recent">
      {data.recent.length === 0 && <Muted>Операцій ще немає.</Muted>}
      <ul className="divide-y text-sm">
        {data.recent.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            data-testid="recent-item"
          >
            <span>
              <span className="text-muted-foreground">
                {formatDate(item.occurredAt, timeZone)} ·{' '}
              </span>
              {item.description ||
                item.categoryName ||
                (item.type === 'income' ? 'Дохід' : 'Видаток')}
              <span className="text-muted-foreground">
                {item.description && item.categoryName ? ` · ${item.categoryName}` : ''} ·{' '}
                {item.accountName}
              </span>
            </span>
            <span className="tabular-nums">
              {RECENT_SIGN[item.type]}
              {formatMoney({ amountMinor: Math.abs(item.amountMinor), currency: item.currency })}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}
