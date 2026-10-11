import { formatMoney, type Account, type Category, type Transaction } from '@hf/shared';
import type { ReactNode } from 'react';
import { errorMessage } from '../../shared/api/index.ts';
import { Button, ErrorText } from '../../shared/ui/controls.tsx';
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

  function handleDelete(transaction: Transaction) {
    if (window.confirm('Видалити цей запис?')) remove.mutate(transaction.id);
  }

  return (
    <>
      <ErrorText>{remove.isError && errorMessage(remove.error)}</ErrorText>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 text-black/60">
            <tr>
              <th className="py-2 pr-4 font-normal">Дата</th>
              <th className="py-2 pr-4 font-normal">Опис</th>
              <th className="py-2 pr-4 font-normal">Рахунок</th>
              <th className="py-2 pr-4 text-right font-normal">Сума</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((transaction) => (
              <tr key={transaction.id} className="border-b border-black/5">
                <td className="py-2 pr-4 whitespace-nowrap">
                  {formatDate(transaction.occurredAt, timeZone)}
                </td>
                <td className="py-2 pr-4">
                  <div>{transaction.description || '—'}</div>
                  {transaction.type !== 'transfer' && (
                    <div className="text-xs text-black/50">
                      {categoryName(transaction.categoryId)}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {transaction.type === 'transfer'
                    ? `${accountName(transaction.accountId)} → ${accountName(transaction.toAccountId)}`
                    : accountName(transaction.accountId)}
                </td>
                <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums">
                  {formatMoney(transaction)}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {renderActions?.(transaction)}
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => handleDelete(transaction)}
                  >
                    Видалити
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
