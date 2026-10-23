import { formatMoney, type Account, type Category, type Transaction } from '@hf/shared';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.tsx';
import { ErrorText } from '../../shared/ui/controls.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu.tsx';
import { formatDate, formatShortDate } from '../../shared/ui/format.ts';
import { ListRow } from '../../shared/ui/list-row.tsx';
import { useMediaQuery, WIDE_SCREEN } from '../../shared/lib/useMediaQuery.ts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { categoryLabel } from '../categories/tree.ts';
import { useDeleteTransaction } from './api.ts';

interface Props {
  items: readonly Transaction[];
  accounts: readonly Account[];
  categories: readonly Category[];
  timeZone: string;
  /** Якщо задано, у меню рядка з'являється дія «Змінити». */
  onEdit?: (transaction: Transaction) => void;
}

export function TransactionTable({ items, accounts, categories, timeZone, onEdit }: Props) {
  const remove = useDeleteTransaction();
  const isWide = useMediaQuery(WIDE_SCREEN);
  // id зберігається й після закриття, щоб діалог не втрачав ціль під час анімації.
  const [deletion, setDeletion] = useState<{ open: boolean; id?: string }>({ open: false });

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—';
  const categoryName = (id: string | null) => {
    const category = id ? categories.find((c) => c.id === id) : undefined;
    if (!category) return id ? '—' : 'Без категорії';
    return categoryLabel(category, categories);
  };
  const accountsText = (transaction: Transaction) =>
    transaction.type === 'transfer'
      ? `${accountName(transaction.accountId)} → ${accountName(transaction.toAccountId)}`
      : accountName(transaction.accountId);
  const actions = (transaction: Transaction) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Дії із записом">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onSelect={() => onEdit(transaction)}>
            <Pencil />
            Змінити
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={remove.isPending}
          onSelect={() => setDeletion({ open: true, id: transaction.id })}
        >
          <Trash2 />
          Видалити
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      {!isWide && (
        // На телефоні таблиця не вміщається: сума й дії опинялися за краєм екрана.
        <ul className="divide-y text-sm" data-testid="transaction-list">
          {items.map((transaction) => {
            const category =
              transaction.type === 'transfer' ? null : categoryName(transaction.categoryId);
            return (
              <ListRow
                key={transaction.id}
                className="py-2"
                data-testid="transaction-item"
                meta={[
                  formatShortDate(transaction.occurredAt, timeZone),
                  transaction.description && category,
                  accountsText(transaction),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                amount={formatMoney(transaction)}
                actions={actions(transaction)}
              >
                {transaction.description || category || accountsText(transaction)}
              </ListRow>
            );
          })}
        </ul>
      )}
      {isWide && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Опис</TableHead>
              <TableHead>Рахунок</TableHead>
              <TableHead className="text-right">Сума</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Дії</span>
              </TableHead>
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
                <TableCell>{accountsText(transaction)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(transaction)}
                </TableCell>
                <TableCell className="text-right">{actions(transaction)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ConfirmDialog
        open={deletion.open}
        onOpenChange={(open) => setDeletion({ ...deletion, open })}
        title="Видалити цей запис?"
        onConfirm={() => deletion.id && remove.mutate(deletion.id)}
      />
    </>
  );
}
