import type { ShoppingList } from '@hf/shared';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Muted } from '../../shared/ui/controls.tsx';
import { formatDate } from '../../shared/ui/format.ts';
import { useCurrentUser } from '../auth/authContext.ts';
import { useShoppingList } from './api.ts';
import { PRODUCT_UNIT_LABELS } from './productForm.ts';
import { moneyOrDash, quantityLabel } from './shoppingForm.ts';

/**
 * Список для друку без меню застосунку. PDF — через системний діалог друку
 * («Зберегти як PDF»), тож окремої бібліотеки для PDF немає.
 */
export function PrintListPage() {
  const { id = '' } = useParams();
  const list = useShoppingList(id);

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-6 print:max-w-none print:p-0">
      <ErrorText>{list.isError && errorMessage(list.error)}</ErrorText>
      {list.isPending && <Muted>Завантаження…</Muted>}
      {list.data && <PrintContent list={list.data} />}
    </div>
  );
}

function PrintContent({ list }: { list: ShoppingList }) {
  const { user } = useCurrentUser();
  const [onlyPending, setOnlyPending] = useState(false);
  const items = onlyPending ? list.items.filter((item) => !item.isBought) : list.items;
  const money = (amountMinor: number | null) => moneyOrDash(amountMinor, list.currency);
  const unpriced = items.filter((item) => item.expectedUnitPrice === null).length;

  // Назва вкладки стає назвою файлу, коли список зберігають як PDF.
  useEffect(() => {
    const previous = document.title;
    document.title = `Покупки — ${list.name}`;
    return () => {
      document.title = previous;
    };
  }, [list.name]);

  return (
    <>
      <div className="space-y-3 print:hidden" data-testid="print-toolbar">
        <Link
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          to={`/menu/lists/${list.id}`}
        >
          <ArrowLeft className="size-4" aria-hidden />
          До списку
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => window.print()}>
            <Printer />
            Друкувати
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Download />
            Завантажити PDF
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
            />
            Лише некуплене
          </label>
        </div>
        <Muted>Для PDF у вікні друку виберіть принтер «Зберегти як PDF».</Muted>
      </div>

      <header className="flex items-baseline justify-between gap-4 border-b pb-2">
        <h1 className="text-xl font-semibold">{list.name}</h1>
        <span className="text-sm text-muted-foreground">
          {formatDate(new Date().toISOString(), user.timeZone)}
        </span>
      </header>

      {items.length === 0 ? (
        <Muted>{onlyPending ? 'Усе вже куплено.' : 'Список порожній.'}</Muted>
      ) : (
        <table className="w-full border-collapse text-sm" data-testid="print-table">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 py-1.5" aria-label="Куплено" />
              <th className="py-1.5 font-medium">Продукт</th>
              <th className="py-1.5 text-right font-medium">Кількість</th>
              <th className="py-1.5 text-right font-medium">Ціна</th>
              <th className="py-1.5 text-right font-medium">Сума</th>
              <th className="w-28 py-1.5 text-right font-medium">Фактична ціна</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                data-testid="print-item"
                className="border-b break-inside-avoid last:border-0"
              >
                <td className="py-2">
                  {/* Квадратик, який відмічають ручкою; куплене вже відмічено. */}
                  <span
                    aria-hidden
                    className="flex size-4 items-center justify-center rounded-sm border border-foreground text-xs leading-none"
                  >
                    {item.isBought ? '✓' : ''}
                  </span>
                </td>
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-right tabular-nums">{quantityLabel(item)}</td>
                <td className="py-2 text-right tabular-nums">
                  {item.expectedUnitPrice === null
                    ? '—'
                    : `${money(item.expectedUnitPrice)} / ${PRODUCT_UNIT_LABELS[item.unit]}`}
                </td>
                <td className="py-2 text-right tabular-nums">{money(item.expectedTotal)}</td>
                <td className="py-2 text-right tabular-nums">
                  {item.actualUnitPrice === null ? (
                    // Місце, щоб вписати ціну з полиці.
                    <span className="inline-block w-24 border-b border-dotted border-foreground" />
                  ) : (
                    money(item.actualUnitPrice)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="ml-auto w-fit space-y-1 text-sm" data-testid="print-totals">
        <div className="flex justify-between gap-8">
          <dt className="text-muted-foreground">
            {onlyPending ? 'Очікувано за некуплене' : 'Очікувано за весь список'}
          </dt>
          <dd className="font-semibold tabular-nums">
            {money(onlyPending ? list.totals.remaining : list.totals.expected)}
          </dd>
        </div>
        {!onlyPending && list.totals.boughtCount > 0 && (
          <div className="flex justify-between gap-8">
            <dt className="text-muted-foreground">Уже куплено фактично</dt>
            <dd className="tabular-nums">{money(list.totals.actual)}</dd>
          </div>
        )}
        {unpriced > 0 && (
          <div className="text-xs text-muted-foreground">
            Без ціни: {unpriced} — їх немає в сумі.
          </div>
        )}
      </dl>
    </>
  );
}
