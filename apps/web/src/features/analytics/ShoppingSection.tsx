import { formatMoney, formatQuantity, type ShoppingAnalytics } from '@hf/shared';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { percentText } from '../../shared/ui/format.ts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { PriceHistoryDialog } from '../shopping/PriceHistoryDialog.tsx';
import { PRODUCT_UNIT_LABELS } from '../shopping/productForm.ts';
import { Figure, Section } from './parts.tsx';
import { signedMoney } from './signedMoney.ts';

/** Скільки продуктів показати в таблиці. */
const TOP_PRODUCTS = 10;

/** Куплене за списками покупок за місяць; окремо від витрат. */
export function ShoppingSection({ data }: { data: ShoppingAnalytics }) {
  const { currency } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const [history, setHistory] = useState<{ id: string; name: string }>();

  return (
    <Section
      title="Покупки за списками"
      description="Окремо від витрат: списки покупок не створюють транзакцій, тому ці суми не входять у витрати, бюджет і капітал."
      testId="analytics-shopping"
    >
      {data.purchaseCount === 0 ? (
        <Muted>
          У цьому місяці за списками нічого не куплено.{' '}
          <Link className="underline underline-offset-4" to="/shopping">
            Перейти до покупок
          </Link>
        </Muted>
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Figure
                title="Куплено за списками"
                value={money(data.spent)}
                hint={`${signedMoney(data.change, currency)} до попереднього місяця`}
              />
              <Figure
                title="Відхилення від очікуваних цін"
                value={signedMoney(data.deviation, currency)}
                hint={deviationHint(data)}
              />
              <Figure
                title="Покупок"
                value={String(data.purchaseCount)}
                hint={data.unpricedCount > 0 ? `без ціни: ${data.unpricedCount}` : undefined}
              />
            </CardContent>
          </Card>

          <Table data-testid="shopping-products">
            <TableHeader>
              <TableRow>
                <TableHead>Продукт</TableHead>
                <TableHead className="text-right">Кількість</TableHead>
                <TableHead className="text-right">Витрачено</TableHead>
                <TableHead className="text-right">Середня ціна</TableHead>
                <TableHead className="text-right">Зміна ціни</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.slice(0, TOP_PRODUCTS).map((row) => {
                const unit = PRODUCT_UNIT_LABELS[row.unit];
                const change =
                  row.previousUnitPrice === null ? null : row.lastUnitPrice - row.previousUnitPrice;
                return (
                  <TableRow key={row.productId} data-testid="shopping-product-row">
                    <TableCell>
                      <button
                        type="button"
                        className="text-left underline-offset-4 hover:underline"
                        title={`Історія цін «${row.name}»`}
                        onClick={() => setHistory({ id: row.productId, name: row.name })}
                      >
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(row.quantityMilli)} {unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.spent)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.averageUnitPrice)} / {unit}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={
                        row.previousUnitPrice === null
                          ? 'Перша покупка'
                          : `Попередня ціна ${money(row.previousUnitPrice)}, остання ${money(row.lastUnitPrice)}`
                      }
                    >
                      {change === null
                        ? '—'
                        : `${signedMoney(change, currency)} (${percentText(change / row.previousUnitPrice!)})`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Зміна ціни — остання покупка місяця порівняно з попередньою покупкою того ж продукту.
              Натисніть на назву, щоб побачити історію цін.
            </span>
          </p>
        </>
      )}
      <PriceHistoryDialog product={history} onClose={() => setHistory(undefined)} />
    </Section>
  );
}

function deviationHint({ deviation }: ShoppingAnalytics): string {
  if (deviation > 0) return 'переплата порівняно з очікуваним';
  if (deviation < 0) return 'економія порівняно з очікуваним';
  return 'як очікували';
}
