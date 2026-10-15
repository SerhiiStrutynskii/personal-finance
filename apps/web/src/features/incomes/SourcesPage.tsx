import { DEFAULT_CURRENCY, formatMoney, localDateKey, type IncomeSource } from '@hf/shared';
import { ArrowLeft, MoreHorizontal, Pencil, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Badge } from '../../shared/ui/badge.tsx';
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
import { activeAccounts, useAccounts } from '../accounts/api.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useDeactivateSource, useDeleteSource, useIncomeSources } from './api.ts';
import { SourceDialog } from './SourceDialog.tsx';
import { describeRule } from './sourceForm.ts';

type Confirmation = { open: boolean; kind: 'deactivate' | 'delete'; source?: IncomeSource };

export function SourcesPage() {
  const { user } = useCurrentUser();
  const sources = useIncomeSources();
  const accounts = useAccounts();
  const deactivate = useDeactivateSource();
  const remove = useDeleteSource();

  // Вміст вікон зберігається й після закриття, щоб не змінюватися під час анімації.
  const [dialog, setDialog] = useState<{ open: boolean; source?: IncomeSource }>({ open: false });
  const [confirmation, setConfirmation] = useState<Confirmation>({ open: false, kind: 'delete' });

  const currency = DEFAULT_CURRENCY;
  const incomeAccounts = activeAccounts(accounts.data).filter(
    (account) => account.currency === currency,
  );
  const accountName = (id: string | null) =>
    accounts.data?.find((account) => account.id === id)?.name ?? '—';
  const error = sources.error ?? accounts.error ?? deactivate.error ?? remove.error;

  return (
    <div className="max-w-4xl space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/incomes">
          <ArrowLeft />
          До прибутків
        </Link>
      </Button>
      <PageHeader
        title="Джерела прибутку"
        action={
          incomeAccounts.length > 0 && (
            <Button onClick={() => setDialog({ open: true })}>Додати джерело</Button>
          )
        }
      />
      <ErrorText>{error && errorMessage(error)}</ErrorText>

      {accounts.data && incomeAccounts.length === 0 && (
        <Muted>
          Щоб додати джерело, спершу{' '}
          <Link className="underline" to="/accounts">
            створіть рахунок
          </Link>{' '}
          у валюті {currency}.
        </Muted>
      )}
      {sources.isPending && <Muted>Завантаження…</Muted>}
      {sources.data?.length === 0 && <Muted>Джерел прибутку ще немає.</Muted>}

      <ul className="space-y-2">
        {sources.data?.map((source) => (
          <li
            key={source.id}
            data-testid="income-source"
            className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border p-3 ${source.isActive ? '' : 'bg-muted/50'}`}
          >
            <div>
              <div className="flex items-center gap-2 font-medium">
                {source.name}
                {!source.isActive && <Badge variant="outline">Неактивне</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {describeRule(source)} ·{' '}
                <span className="tabular-nums">
                  {formatMoney({ amountMinor: source.plannedAmount, currency: source.currency })}
                </span>{' '}
                · {accountName(source.accountId)} · з {formatDateString(source.startDate)}
                {source.endDate && ` до ${formatDateString(source.endDate)}`}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Дії з джерелом «${source.name}»`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {source.isActive && (
                  <>
                    <DropdownMenuItem onSelect={() => setDialog({ open: true, source })}>
                      <Pencil />
                      Змінити
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setConfirmation({ open: true, kind: 'deactivate', source })}
                    >
                      <Power />
                      Деактивувати
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmation({ open: true, kind: 'delete', source })}
                >
                  <Trash2 />
                  Видалити
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <SourceDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
        source={dialog.source}
        accounts={incomeAccounts}
        currency={currency}
        today={localDateKey(new Date(), user.timeZone)}
      />
      <ConfirmDialog
        open={confirmation.open}
        onOpenChange={(open) => setConfirmation({ ...confirmation, open })}
        title={
          confirmation.kind === 'deactivate'
            ? `Деактивувати «${confirmation.source?.name ?? ''}»?`
            : `Видалити «${confirmation.source?.name ?? ''}»?`
        }
        description={
          confirmation.kind === 'deactivate'
            ? 'Майбутні неотримані надходження зникнуть. Історія й отримані прибутки лишаться.'
            : 'Джерело з отриманими прибутками видалити не можна — лише деактивувати.'
        }
        label={confirmation.kind === 'deactivate' ? 'Деактивувати' : 'Видалити'}
        onConfirm={() => {
          const source = confirmation.source;
          if (!source) return;
          if (confirmation.kind === 'deactivate') deactivate.mutate(source.id);
          else remove.mutate(source.id);
        }}
      />
    </div>
  );
}
