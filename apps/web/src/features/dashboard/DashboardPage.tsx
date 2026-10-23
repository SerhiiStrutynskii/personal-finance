import {
  formatMoney,
  getAllowedExpenseDateRange,
  type Dashboard,
  type Transaction,
} from '@hf/shared';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { Figure } from '../../shared/ui/figure.tsx';
import {
  formatDayMonth,
  formatShortDate,
  monthLabel,
  percentText,
} from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { ACCOUNT_TYPE_LABELS, activeAccounts, useAccounts } from '../accounts/api.ts';
import { signedMoney } from '../analytics/signedMoney.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { PlanSummary } from '../budget/PlanSummary.tsx';
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
  // Видаток не може мати майбутню дату; для прибутків меж немає.
  const maxDate =
    entry.type === 'expense'
      ? getAllowedExpenseDateRange(new Date(), user.timeZone).maxDate
      : undefined;
  const open = (type: EntryType) => () => setEntry({ open: true, type });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={
          <>
            Вітаємо, <span className="sm:hidden">{firstName(user.name)}</span>
            <span className="max-sm:hidden">{user.name}</span>
          </>
        }
        action={
          usableAccounts.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <Button onClick={open('expense')}>
                <Plus />
                Видаток
              </Button>
              <Button variant="outline" onClick={open('income')}>
                <Plus />
                Прибуток
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
        // На телефоні «Потребує уваги» одразу під кроками, щоб проблеми було видно без прокручування.
        <div className="flex flex-col gap-6">
          {!(data.setup.hasTransactions && data.setup.hasBudget) && (
            <SetupSteps setup={data.setup} />
          )}
          <MoneyBlock data={data} />
          <Block title="План місяця" to="/budget" testId="dashboard-plan">
            <PlanSummary {...data.plan} currency={data.currency} />
          </Block>
          <MonthBlock data={data} />
          <AttentionBlock data={data} />
          <UpcomingBlock data={data} />
          <GoalsBlock data={data} />
          <RecentBlock data={data} timeZone={user.timeZone} />
        </div>
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

/** «Демо Користувач» -> «Демо»: на телефоні повне ім'я переносить заголовок. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function Block({
  title,
  to,
  testId,
  className = '',
  children,
}: {
  title: string;
  /** Розділ, на який веде заголовок блока. */
  to: string;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`space-y-2 ${className}`} data-testid={testId}>
      <h2 className="font-heading text-lg font-semibold">
        <Link className="underline-offset-4 hover:underline" to={to}>
          {title}
        </Link>
      </h2>
      {children}
    </section>
  );
}

/** Рядок списку: назва й деталі ліворуч, сума праворуч; сума ніколи не переноситься. */
function Row({
  children,
  meta,
  amount,
  note,
  className = '',
  ...props
}: {
  meta?: ReactNode;
  amount: ReactNode;
  /** Дрібний підпис під сумою. */
  note?: ReactNode;
} & ComponentProps<'li'>) {
  return (
    <li className={`flex items-start justify-between gap-3 ${className}`} {...props}>
      <div className="min-w-0 break-words">
        <div>{children}</div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {amount}
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
    </li>
  );
}

/** Кроки для нового користувача; виконаний крок позначено галочкою. */
function SetupSteps({ setup }: { setup: Dashboard['setup'] }) {
  const steps = [
    { done: setup.hasAccounts, to: '/accounts', text: 'Створіть рахунок' },
    { done: setup.hasTransactions, to: '/expenses', text: 'Додайте перший видаток або прибуток' },
    { done: setup.hasBudget, to: '/budget', text: 'Складіть бюджет на місяць' },
  ];
  return (
    <Card data-testid="dashboard-setup" className="max-md:-order-2">
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
  const { money, debtPayments, currency } = data;
  const format = (amountMinor: number, code = currency) =>
    signedMoney(amountMinor, code).replace(/^\+/, '');
  return (
    <Block title="Гроші зараз" to="/accounts" testId="dashboard-money">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
            <Figure
              title="Чисті активи"
              value={format(money.netWorth)}
              hint="рахунки в гривні мінус позики"
            />
            <Figure compact title="На рахунках" value={format(money.accountsTotal)} />
            <Figure compact title="Загальний борг" value={format(money.debtTotal)} />
          </div>
          {debtPayments.required > 0 && (
            <div className="text-sm" data-testid="dashboard-debt-payments">
              <div className="flex items-start justify-between gap-3">
                <Link className="underline underline-offset-4" to="/debts">
                  Обов’язкові платежі по боргах цього місяця
                </Link>
                <span className="shrink-0 font-medium tabular-nums">
                  {format(debtPayments.required)}
                </span>
              </div>
              <div className="text-muted-foreground">
                сплачено {format(debtPayments.paid)} · лишилось {format(debtPayments.remaining)}
              </div>
            </div>
          )}
          <ul className="divide-y text-sm">
            {money.accounts.map((account) => (
              <Row
                key={account.id}
                className="py-1.5"
                amount={format(account.balance, account.currency)}
              >
                {account.name}{' '}
                <span className="text-muted-foreground">· {ACCOUNT_TYPE_LABELS[account.type]}</span>
              </Row>
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4">
            <Figure compact title="Прибуток" value={money(month.income)} />
            <Figure compact title="Витрати" value={money(month.expenses)} />
            <Figure title="Різниця" value={signedMoney(month.net, currency)} />
          </div>
          {planned !== null && planned > 0 && (
            <div className="text-sm">
              <div className="mb-1 flex items-start justify-between gap-3">
                <span className="min-w-0">
                  Витрачено {money(month.expenses)} з {money(planned)} лімітів
                </span>
                <span className="shrink-0 tabular-nums">
                  {percentText(month.expenses / planned)}
                </span>
              </div>
              <Progress
                className="h-1.5"
                value={Math.min(100, (month.expenses / planned) * 100)}
                aria-label="Витрачено від суми лімітів"
              />
            </div>
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
    <Block
      title="Потребує уваги"
      to="/analytics"
      testId="dashboard-attention"
      className="max-md:-order-1"
    >
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
            <Row
              key={`${item.kind}-${item.id ?? 'none'}`}
              className={`rounded-lg border p-3 text-sm ${tone}`}
              data-testid="attention-item"
              data-kind={item.kind}
              meta={
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${text}`}>
                  <Icon className="size-4" aria-hidden />
                  {view.label}
                </span>
              }
              amount={item.amount !== null && money(item.amount)}
              note={item.date && formatDayMonth(item.date)}
            >
              <Link className="font-medium underline-offset-4 hover:underline" to={view.link(item)}>
                {item.name}
              </Link>
            </Row>
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
            <Row
              key={`${item.kind}-${item.id}`}
              className="py-2"
              data-testid="upcoming-item"
              meta={
                <span className="inline-flex items-center gap-1">
                  <Icon className="size-3.5" aria-hidden />
                  {formatDayMonth(item.date)} · {view.label}
                </span>
              }
              amount={`${item.kind === 'income' ? '+' : '−'}${money(item.amount)}`}
            >
              <Link className="underline-offset-4 hover:underline" to={view.link(item.id)}>
                {item.name}
              </Link>
            </Row>
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
          <Row
            key={item.id}
            className="py-2"
            data-testid="recent-item"
            meta={[
              formatShortDate(item.occurredAt, timeZone),
              item.description && item.categoryName,
              item.accountName,
            ]
              .filter(Boolean)
              .join(' · ')}
            amount={`${RECENT_SIGN[item.type]}${formatMoney({
              amountMinor: Math.abs(item.amountMinor),
              currency: item.currency,
            })}`}
          >
            {item.description ||
              item.categoryName ||
              (item.type === 'income' ? 'Прибуток' : 'Видаток')}
          </Row>
        ))}
      </ul>
    </Block>
  );
}
