import { formatMoney, type Account, type Category, type Transaction } from '@hf/shared';
import type { ReactNode } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { ConfirmButton } from '../../shared/ui/confirm-button.tsx';
import { ErrorText } from '../../shared/ui/controls.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { formatDate } from '../../shared/ui/format.ts';
import { useDeleteTransaction } from './api.ts';

interface Props {
  items: readonly Transaction[];
  accounts: readonly Account[];
  categories: readonly Category[];
  timeZone: string;
  /** Додаткові дії в рядку, наприклад посилання на редагування. */
  renderActions?: (transaction: Transaction) => ReactNode;
}

export function TransactionTable({ items, accounts, categories, timeZone, renderActions }: Props) {
  const remove = useDeleteTransaction();
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—';
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? '—') : 'Без категорії';

  return (
    <>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Опис</TableHead>
            <TableHead>Рахунок</TableHead>
            <TableHead className="text-right">Сума</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell>{formatDate(transaction.occurredAt, timeZone)}</TableCell>
              <TableCell className="whitespace-normal">
                <div>{transaction.description || '—'}</div>
                {transaction.type !== 'transfer' && (
                  <div className="text-xs text-muted-foreground">
                    {categoryName(transaction.categoryId)}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {transaction.type === 'transfer'
                  ? `${accountName(transaction.accountId)} → ${accountName(transaction.toAccountId)}`
                  : accountName(transaction.accountId)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(transaction)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  {renderActions?.(transaction)}
                  <ConfirmButton
                    title="Видалити цей запис?"
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate(transaction.id)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
