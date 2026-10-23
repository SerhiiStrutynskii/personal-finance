import { formatMoney, type Debt } from '@hf/shared';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { useIsOwner } from '../auth/authContext.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText, Muted, PageHeader } from '../../shared/ui/controls.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { formatDayMonth } from '../../shared/ui/format.ts';
import { Progress } from '../../shared/ui/progress.tsx';
import { useDebts, useDeleteDebt } from './api.ts';
import { DebtDialog } from './DebtDialog.tsx';
import { DebtsSummary } from './DebtsSummary.tsx';
import {
  DEBT_TYPE_ICONS,
  DEBT_TYPE_LABELS,
  PAYMENT_ROW_CLASS,
  deleteDebtDescription,
  rateText,
} from './labels.ts';
import { PaymentStatusLabel } from './PaymentStatusLabel.tsx';

export function DebtsPage() {
  const debts = useDebts();
  const remove = useDeleteDebt();
  const isOwner = useIsOwner();
  // Борг зберігається й після закриття, щоб вміст вікна не змінювався під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; original?: Debt }>({ open: false });
  const [deletion, setDeletion] = useState<{ open: boolean; debt?: Debt }>({ open: false });
  const overview = debts.data;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Борги"
        action={
          isOwner && (
            <Button onClick={() => setDialog({ open: true })}>
              <Plus />
              Борг
            </Button>
          )
        }
      />
      <ErrorText>{debts.isError && errorMessage(debts.error)}</ErrorText>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {debts.isPending && <Muted>Завантаження…</Muted>}

      {overview && overview.debts.length === 0 && (
        <Muted>
          {isOwner
            ? 'Боргів ще немає. Додайте кредитну картку, розстрочку чи позику кнопкою вгорі.'
            : 'Боргів ще немає. Їх додає власник домогосподарства.'}
        </Muted>
      )}
      {overview && overview.debts.length > 0 && (
        <>
          <DebtsSummary overview={overview} />
          <ul className="space-y-2">
            {overview.debts.map((debt) => (
              <DebtRow
                key={debt.id}
                debt={debt}
                today={overview.today}
                canEdit={isOwner}
                onEdit={() => setDialog({ open: true, original: debt })}
                onDelete={() => setDeletion({ open: true, debt })}
              />
            ))}
          </ul>
        </>
      )}

      {overview && (
        <DebtDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog({ ...dialog, open })}
          today={overview.today}
          original={dialog.original}
        />
      )}
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title={`Видалити борг «${deletion.debt?.name ?? ''}»?`}
        description={deletion.debt && deleteDebtDescription(deletion.debt)}
        onConfirm={() => deletion.debt && remove.mutate(deletion.debt.id)}
      />
    </div>
  );
}

function DebtRow({
  debt,
  today,
  canEdit,
  onEdit,
  onDelete,
}: {
  debt: Debt;
  today: string;
  /** Змінювати й видаляти борг може лише власник домогосподарства. */
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
      {/* Залишок і дії праворуч від назви; деталі під ними на всю ширину картки. */}
      <div className="flex items-start justify-between gap-3">
        <Link
          className="min-w-0 font-medium break-words underline-offset-4 hover:underline"
          to={`/debts/${debt.id}`}
        >
          {debt.name}
        </Link>
        <div className="-my-1.5 -mr-2 flex shrink-0 items-center gap-1">
          <div className="text-base font-semibold tabular-nums">{money(debt.balance)}</div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Дії з боргом «${debt.name}»`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  Змінити умови
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 />
                  Видалити
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="size-4 shrink-0" aria-hidden />
        {DEBT_TYPE_LABELS[debt.type]} · {rateText(debt)}
        {closed && ' · закрито'}
      </div>
      <div className="text-muted-foreground">
        Платіж {money(debt.monthlyPayment)} до {formatDayMonth(debt.month.dueDate)}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {closed ? (
          <span className="text-muted-foreground">Борг закрито</span>
        ) : (
          <PaymentStatusLabel payment={debt.month} today={today} currency={debt.currency} />
        )}
        {debt.card ? (
          <div className="w-full sm:w-96">
            <div className="mb-1 text-muted-foreground sm:text-right">
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
            <div className="w-full sm:w-96">
              <div className="mb-1 text-muted-foreground sm:text-right">
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
