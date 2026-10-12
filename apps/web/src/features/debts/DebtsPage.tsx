import { formatMoney, type Debt } from '@hf/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import { formatDayMonth } from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { useDebts } from './api.ts';
import { DebtDialog } from './DebtDialog.tsx';
import { DebtsSummary } from './DebtsSummary.tsx';
import { DEBT_TYPE_ICONS, DEBT_TYPE_LABELS, PAYMENT_ROW_CLASS, rateText } from './labels.ts';
import { PaymentStatusLabel } from './PaymentStatusLabel.tsx';

export function DebtsPage() {
  const debts = useDebts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const overview = debts.data;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Борги"
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Борг
          </Button>
        }
      />
      <ErrorText>{debts.isError && errorMessage(debts.error)}</ErrorText>
      {debts.isPending && <Muted>Завантаження…</Muted>}

      {overview && overview.debts.length === 0 && (
        <Muted>Боргів ще немає. Додайте кредитну картку, розстрочку чи позику кнопкою вгорі.</Muted>
      )}
      {overview && overview.debts.length > 0 && (
        <>
          <DebtsSummary overview={overview} />
          <ul className="space-y-2">
            {overview.debts.map((debt) => (
              <DebtRow key={debt.id} debt={debt} today={overview.today} />
            ))}
          </ul>
        </>
      )}

      {overview && (
        <DebtDialog open={dialogOpen} onOpenChange={setDialogOpen} today={overview.today} />
      )}
    </div>
  );
}

function DebtRow({ debt, today }: { debt: Debt; today: string }) {
  const Icon = DEBT_TYPE_ICONS[debt.type];
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: debt.currency });
  const closed = debt.status === 'closed';
  // Частка погашеного від початкової суми; у кредитки замість цього — використання ліміту.
  const repaid =
    debt.initialAmount > 0
      ? Math.min(100, Math.max(0, (1 - debt.balance / debt.initialAmount) * 100))
      : 0;

  return (
    <li
      className={`rounded-lg border p-3 text-sm ${closed ? 'border-border bg-muted/50' : PAYMENT_ROW_CLASS[debt.month.status]}`}
      data-testid="debt-row"
      data-status={debt.month.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Link className="font-medium underline-offset-4 hover:underline" to={`/debts/${debt.id}`}>
            {debt.name}
          </Link>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Icon className="size-4" aria-hidden />
            {DEBT_TYPE_LABELS[debt.type]} · {rateText(debt)}
            {closed && ' · закрито'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold tabular-nums">{money(debt.balance)}</div>
          <div className="text-muted-foreground">
            Платіж {money(debt.monthlyPayment)} до {formatDayMonth(debt.month.dueDate)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {closed ? (
          <span className="text-muted-foreground">Борг закрито</span>
        ) : (
          <PaymentStatusLabel payment={debt.month} today={today} currency={debt.currency} />
        )}
        {debt.card ? (
          <div className="w-full sm:w-64">
            <div className="mb-1 text-right text-muted-foreground">
              Використано {money(debt.balance)} з {money(debt.card.creditLimit)}
              {debt.card.nearLimit && ' · ліміт майже вичерпано'}
            </div>
            <Progress
              className="h-1.5"
              value={Math.min(100, debt.card.usage * 100)}
              aria-label="Використання кредитного ліміту"
            />
          </div>
        ) : (
          debt.initialAmount > 0 && (
            <div className="w-full sm:w-64">
              <div className="mb-1 text-right text-muted-foreground">
                Погашено {money(Math.max(0, debt.initialAmount - debt.balance))} з{' '}
                {money(debt.initialAmount)}
              </div>
              <Progress className="h-1.5" value={repaid} aria-label="Погашено від суми боргу" />
            </div>
          )
        )}
      </div>
    </li>
  );
}
