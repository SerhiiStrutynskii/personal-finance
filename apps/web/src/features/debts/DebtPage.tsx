import { formatMoney, type Account, type DebtDetails, type Transaction } from '@hf/shared';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { formatDate, formatDateString, formatDayMonth } from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { activeAccounts, useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useCloseDebt, useDebt, useDeleteDebt, useDeleteDebtEntry } from './api.ts';
import { DebtDialog } from './DebtDialog.tsx';
import { DEBT_TYPE_ICONS, DEBT_TYPE_LABELS, rateText } from './labels.ts';
import {
  AdjustDialog,
  CardPaymentDialog,
  ChargeDialog,
  LoanPaymentDialog,
} from './MovementDialogs.tsx';
import { PaymentStatusLabel } from './PaymentStatusLabel.tsx';
import { ProjectionInfo } from './ProjectionInfo.tsx';

export function DebtPage() {
  const { id = '' } = useParams();
  const debt = useDebt(id);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        to="/debts"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Усі борги
      </Link>
      <ErrorText>{debt.isError && errorMessage(debt.error)}</ErrorText>
      {debt.isPending && <Muted>Завантаження…</Muted>}
      {debt.data && <DebtContent debt={debt.data} />}
    </div>
  );
}

type Action = 'pay' | 'charge' | 'adjust' | 'edit';

function DebtContent({ debt }: { debt: DebtDetails }) {
  const navigate = useNavigate();
  const accounts = useAccounts();
  const close = useCloseDebt();
  const remove = useDeleteDebt();
  // Вид вікна зберігається й після закриття, щоб вміст не змінювався під час анімації.
  const [action, setAction] = useState<{ open: boolean; kind: Action }>({
    open: false,
    kind: 'pay',
  });
  const [confirm, setConfirm] = useState<{ open: boolean; kind: 'close' | 'delete' }>({
    open: false,
    kind: 'close',
  });

  const isCard = debt.type === 'credit_card';
  const closed = debt.status === 'closed';
  const Icon = DEBT_TYPE_ICONS[debt.type];
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: debt.currency });
  const payable = activeAccounts(accounts.data).filter(
    (account) => account.currency === debt.currency && account.id !== debt.accountId,
  );
  const dialog = (kind: Action) => ({
    open: action.open && action.kind === kind,
    onOpenChange: (open: boolean) => setAction({ ...action, open }),
    debt,
  });
  const open = (kind: Action) => () => setAction({ open: true, kind });
  const error = accounts.error ?? close.error ?? remove.error;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">{debt.name}</h1>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Icon className="size-4" aria-hidden />
            {DEBT_TYPE_LABELS[debt.type]}
            {closed && ' · закрито'}
          </div>
          {debt.description && <p className="mt-1 text-sm">{debt.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!closed && (
            <>
              <Button onClick={open('pay')} disabled={debt.balance === 0}>
                {isCard ? 'Погасити' : 'Сплатити'}
              </Button>
              <Button variant="outline" onClick={open('charge')}>
                {isCard ? 'Відсотки / комісія' : 'Нарахування'}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={open('adjust')} disabled={closed && isCard}>
            Звірити залишок
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Дії з боргом">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={open('edit')}>Змінити умови</DropdownMenuItem>
              {!closed && (
                <DropdownMenuItem
                  disabled={debt.balance > 0}
                  onSelect={() => setConfirm({ open: true, kind: 'close' })}
                >
                  Закрити борг
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirm({ open: true, kind: 'delete' })}
              >
                Видалити
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ErrorText>{error && errorMessage(error)}</ErrorText>

      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Figure title="Залишок боргу" value={money(debt.balance)} testId="debt-balance" />
            <Figure
              title={isCard ? 'Мінімальний платіж' : 'Щомісячний платіж'}
              value={`${money(debt.monthlyPayment)} до ${formatDayMonth(debt.month.dueDate)}`}
            />
            <Figure title="Ставка" value={rateText(debt)} />
          </div>
          {!closed && (
            <div
              className="text-sm"
              data-testid="debt-month-status"
              data-status={debt.month.status}
            >
              <PaymentStatusLabel
                payment={debt.month}
                today={debt.today}
                currency={debt.currency}
              />
            </div>
          )}
          {debt.card && (
            <div className="text-sm" data-testid="card-limit">
              <div className="mb-1">
                Використано {money(debt.balance)} з {money(debt.card.creditLimit)} · доступно{' '}
                {money(debt.card.available)}
                {debt.card.overLimitBy > 0 && (
                  <span className="text-status-over">
                    {' '}
                    · ліміт перевищено на {money(debt.card.overLimitBy)}
                  </span>
                )}
                {debt.card.overLimitBy === 0 && debt.card.nearLimit && ' · ліміт майже вичерпано'}
              </div>
              <Progress
                className="h-1.5"
                value={Math.min(100, debt.card.usage * 100)}
                aria-label="Використання кредитного ліміту"
              />
            </div>
          )}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <Term title="Початок">{formatDateString(debt.startDate)}</Term>
            <Term title={isCard ? 'Діє до' : 'Виданий до'}>
              {debt.maturityDate ? formatDateString(debt.maturityDate) : '—'}
            </Term>
            {!isCard && (
              <>
                <Term title="Початкова сума">{money(debt.initialAmount)}</Term>
                <Term title="Дострокове погашення">
                  {debt.earlyRepaymentAllowed ? 'можливе' : 'не передбачене'}
                </Term>
              </>
            )}
            {debt.accountId && (
              <Term title="Рахунок-картка">
                <Link className="underline underline-offset-4" to="/accounts">
                  {accountName(accounts.data, debt.accountId)}
                </Link>
              </Term>
            )}
            <Term title="Гаситься з рахунку">
              {accountName(accounts.data, debt.defaultAccountId)}
            </Term>
          </dl>
        </CardContent>
      </Card>

      {!closed && (
        <section>
          <h2 className="mb-2 font-heading text-lg font-semibold">Прогноз погашення</h2>
          <ProjectionInfo
            projection={debt.projection}
            maturityDate={debt.maturityDate}
            currency={debt.currency}
          />
        </section>
      )}

      <section>
        <h2 className="mb-2 font-heading text-lg font-semibold">Історія</h2>
        {isCard ? (
          <CardHistory debt={debt} accounts={accounts.data ?? []} />
        ) : (
          <LoanHistory debt={debt} accounts={accounts.data ?? []} />
        )}
      </section>

      {isCard ? (
        <CardPaymentDialog {...dialog('pay')} accounts={payable} />
      ) : (
        <LoanPaymentDialog {...dialog('pay')} accounts={payable} />
      )}
      <ChargeDialog {...dialog('charge')} />
      <AdjustDialog {...dialog('adjust')} />
      <DebtDialog
        open={action.open && action.kind === 'edit'}
        onOpenChange={(next) => setAction({ ...action, open: next })}
        today={debt.today}
        original={debt}
      />
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(next) => setConfirm({ ...confirm, open: next })}
        title={
          confirm.kind === 'close'
            ? `Закрити борг «${debt.name}»?`
            : `Видалити борг «${debt.name}»?`
        }
        description={
          confirm.kind === 'close'
            ? isCard
              ? 'Рахунок-картка перейде в архів і більше не прийматиме транзакцій.'
              : 'Борг перейде в закриті.'
            : 'Видалити можна лише борг без рухів. Цю дію не можна скасувати.'
        }
        label={confirm.kind === 'close' ? 'Закрити' : 'Видалити'}
        onConfirm={() =>
          confirm.kind === 'close'
            ? close.mutate(debt.id)
            : remove.mutate(debt.id, { onSuccess: () => navigate('/debts') })
        }
      />
    </>
  );
}

const accountName = (accounts: readonly Account[] | undefined, id: string | null) =>
  id ? (accounts?.find((account) => account.id === id)?.name ?? '—') : '—';

function Figure({ title, value, testId }: { title: string; value: string; testId?: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function Term({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1">
      <dt className="text-muted-foreground">{title}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const ENTRY_LABELS = { payment: 'Платіж', charge: 'Нарахування', adjustment: 'Звірка' } as const;

/** Записи позики: платежі з розбивкою, нарахування, звірки. */
function LoanHistory({ debt, accounts }: { debt: DebtDetails; accounts: readonly Account[] }) {
  const remove = useDeleteDebtEntry();
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: debt.currency });
  if (debt.entries.length === 0) return <Muted>Рухів ще немає.</Muted>;

  return (
    <>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      <ul className="divide-y text-sm" data-testid="debt-history">
        {debt.entries.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0">
              <div>
                {formatDateString(entry.date)} · {ENTRY_LABELS[entry.kind]}
                {entry.accountId && ` з рахунку «${accountName(accounts, entry.accountId)}»`}
              </div>
              <div className="text-xs text-muted-foreground">
                {entry.kind === 'payment' &&
                  `тіло ${money(entry.principalPart ?? 0)}, відсотки ${money(entry.interestPart ?? 0)}`}
                {entry.note}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                {/* Платіж і від'ємна звірка зменшують борг, нарахування — збільшує. */}
                {entry.kind === 'payment' ? '−' : entry.amount < 0 ? '−' : '+'}
                {money(Math.abs(entry.amount))}
              </span>
              <ConfirmButton
                title="Видалити цей запис?"
                description={
                  entry.kind === 'payment'
                    ? 'Разом із записом зникне транзакція рахунку, і його баланс відновиться.'
                    : 'Залишок боргу буде перераховано.'
                }
                disabled={remove.isPending}
                onConfirm={() => remove.mutate({ id: debt.id, entryId: entry.id })}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Що означає транзакція рахунку-картки для боргу і з яким знаком вона його змінює. */
function describeCardTransaction(transaction: Transaction, cardAccountId: string | null) {
  const amount = Math.abs(transaction.amountMinor);
  switch (transaction.type) {
    case 'expense':
      return { label: 'Покупка', increases: true, amount };
    case 'income':
      return { label: 'Повернення коштів', increases: false, amount };
    case 'transfer':
      return transaction.toAccountId === cardAccountId
        ? { label: 'Погашення', increases: false, amount }
        : { label: 'Переказ з картки', increases: true, amount };
    case 'balance_adjustment':
      return { label: 'Звірка', increases: transaction.amountMinor < 0, amount };
    case 'debt_payment':
      return { label: 'Платіж по іншому боргу', increases: true, amount };
  }
}

/** Історія кредитки — транзакції рахунку-картки: покупки, погашення, відсотки, звірки. */
function CardHistory({ debt, accounts }: { debt: DebtDetails; accounts: readonly Account[] }) {
  const { user } = useCurrentUser();
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: debt.currency });
  if (debt.transactions.length === 0) return <Muted>Рухів ще немає.</Muted>;

  return (
    <>
      <ul className="divide-y text-sm" data-testid="debt-history">
        {debt.transactions.map((transaction) => {
          const { label, increases, amount } = describeCardTransaction(transaction, debt.accountId);
          const from =
            transaction.type === 'transfer' && transaction.toAccountId === debt.accountId
              ? ` з рахунку «${accountName(accounts, transaction.accountId)}»`
              : '';
          return (
            <li key={transaction.id} className="flex items-center justify-between gap-4 py-2">
              <div className="min-w-0">
                <div>
                  {formatDate(transaction.occurredAt, user.timeZone)} · {label}
                  {from}
                </div>
                <div className="text-xs text-muted-foreground">{transaction.description}</div>
              </div>
              <span className="tabular-nums">
                {increases ? '+' : '−'}
                {money(amount)}
              </span>
            </li>
          );
        })}
      </ul>
      <Muted>
        Покупки змінюються на сторінці «Витрати», погашення — у переказах на сторінці «Рахунки».
      </Muted>
    </>
  );
}
