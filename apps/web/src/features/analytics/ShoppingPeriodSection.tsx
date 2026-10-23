import { formatMoney, formatQuantity, type ShoppingPeriod } from '@hf/shared';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from 'recharts';
import { useMediaQuery, WIDE_SCREEN } from '../../shared/lib/useMediaQuery.ts';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../shared/ui/chart.tsx';
import { Field, Muted } from '../../shared/ui/controls.tsx';
import { monthLabel, percentText, shortMonthLabel } from '../../shared/ui/format.ts';
import { ListRow } from '../../shared/ui/list-row.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { PriceHistoryDialog } from '../shopping/PriceHistoryDialog.tsx';
import { PRODUCT_UNIT_LABELS } from '../shopping/productForm.ts';
import { Figure } from '../../shared/ui/figure.tsx';
import { sliceColor, topProductSlices } from './shoppingChart.ts';

const spentConfig = { spent: { label: 'Куплено', color: 'var(--chart-3)' } } satisfies ChartConfig;

/** Покупки за кілька місяців: таблиця продуктів і графіки — основа для плану на місяць. */
export function ShoppingPeriodSection({ data }: { data: ShoppingPeriod }) {
  const { currency } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const [history, setHistory] = useState<{ id: string; name: string }>();
  const range = `${monthLabel(data.months[0]!)} — ${monthLabel(data.months.at(-1)!)}`;

  return (
    <div className="space-y-6" data-testid="shopping-period">
      <div>
        <h3 className="font-heading font-semibold">
          За {data.months.length} міс.: {range}
        </h3>
        <p className="text-sm text-muted-foreground">
          Період змінюється перемикачами місяця й довжини вгорі сторінки.
        </p>
      </div>

      {data.purchaseCount === 0 ? (
        <Muted>За цей період за списками нічого не куплено.</Muted>
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Figure compact title="Разом за період" value={money(data.total)} />
              <Figure
                compact
                title="В середньому на місяць"
                value={money(data.averagePerMonth)}
                hint="орієнтир для плану покупок"
              />
              <Figure
                compact
                title="Покупок"
                value={String(data.purchaseCount)}
                hint={data.unpricedCount > 0 ? `без ціни: ${data.unpricedCount}` : undefined}
              />
            </CardContent>
          </Card>

          <ProductsTable data={data} onHistory={setHistory} />
          <MonthlyChart data={data} />
          <TopProductsPie data={data} />
          <ProductByMonth data={data} />

          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Середнє на місяць ділить суму на всі місяці періоду, зокрема місяці без покупок і
              поточний, ще не завершений.
            </span>
          </p>
        </>
      )}
      <PriceHistoryDialog product={history} onClose={() => setHistory(undefined)} />
    </div>
  );
}

function ProductsTable({
  data,
  onHistory,
}: {
  data: ShoppingPeriod;
  onHistory: (product: { id: string; name: string }) => void;
}) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: data.currency });
  const isWide = useMediaQuery(WIDE_SCREEN);
  const priceRange = (row: ShoppingPeriod['products'][number]) =>
    row.minUnitPrice === row.maxUnitPrice
      ? money(row.minUnitPrice)
      : `${money(row.minUnitPrice)} – ${money(row.maxUnitPrice)}`;
  const nameButton = (row: ShoppingPeriod['products'][number]) => (
    <button
      type="button"
      className="text-left underline-offset-4 hover:underline"
      title={`Історія цін «${row.name}»`}
      onClick={() => onHistory({ id: row.productId, name: row.name })}
    >
      {row.name}
    </button>
  );

  if (!isWide) {
    return (
      <section className="space-y-2">
        <h4 className="font-medium">Що й скільки куплено</h4>
        <ul className="divide-y text-sm" data-testid="shopping-period-table">
          {data.products.map((row) => {
            const unit = PRODUCT_UNIT_LABELS[row.unit];
            return (
              <ListRow
                key={row.productId}
                className="py-2"
                data-testid="shopping-period-row"
                meta={
                  <>
                    <div>
                      {formatQuantity(row.quantityMilli)} {unit} · покупок: {row.purchaseCount} ·{' '}
                      {money(row.averagePerMonth)} на місяць
                    </div>
                    <div>
                      ціна {priceRange(row)}, в середньому {money(row.averageUnitPrice)} / {unit}
                    </div>
                  </>
                }
                amount={money(row.spent)}
                note={percentText(row.share)}
              >
                {nameButton(row)}
              </ListRow>
            );
          })}
          <ListRow
            className="py-2 font-medium"
            meta={`${money(data.averagePerMonth)} на місяць`}
            amount={money(data.total)}
          >
            Разом
          </ListRow>
        </ul>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h4 className="font-medium">Що й скільки куплено</h4>
      <Table data-testid="shopping-period-table">
        <TableHeader>
          <TableRow>
            <TableHead>Продукт</TableHead>
            <TableHead className="text-right">Кількість</TableHead>
            <TableHead className="text-right">Витрачено</TableHead>
            <TableHead className="text-right">Частка</TableHead>
            <TableHead className="text-right">На місяць</TableHead>
            <TableHead className="text-right">Середня ціна</TableHead>
            <TableHead className="text-right">Ціна мін – макс</TableHead>
            <TableHead className="text-right">Покупок</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.products.map((row) => {
            const unit = PRODUCT_UNIT_LABELS[row.unit];
            return (
              <TableRow key={row.productId} data-testid="shopping-period-row">
                <TableCell>{nameButton(row)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(row.quantityMilli)} {unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(row.spent)}</TableCell>
                <TableCell className="text-right tabular-nums">{percentText(row.share)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.averagePerMonth)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(row.averageUnitPrice)} / {unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">{priceRange(row)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.purchaseCount}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Разом</TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">{money(data.total)}</TableCell>
            <TableCell className="text-right tabular-nums">100%</TableCell>
            <TableCell className="text-right tabular-nums">{money(data.averagePerMonth)}</TableCell>
            <TableCell colSpan={2} />
            <TableCell className="text-right tabular-nums">
              {data.purchaseCount - data.unpricedCount}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

function MonthlyChart({ data }: { data: ShoppingPeriod }) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: data.currency });
  return (
    <section className="space-y-2" data-testid="shopping-monthly-chart">
      <h4 className="font-medium">Покупки по місяцях</h4>
      <ChartContainer config={spentConfig} className="aspect-auto h-56 w-full">
        <BarChart accessibilityLayer data={data.points}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={shortMonthLabel}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => monthLabel(String(value))}
                formatter={(value) => `Куплено: ${money(Number(value))}`}
              />
            }
          />
          <Bar dataKey="spent" isAnimationActive={false} fill="var(--color-spent)" radius={4} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

function TopProductsPie({ data }: { data: ShoppingPeriod }) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: data.currency });
  const slices = topProductSlices(data).map((slice, index) => ({
    ...slice,
    fill: sliceColor(index, slice.key),
  }));
  const config = Object.fromEntries(
    slices.map((slice) => [slice.key, { label: slice.name, color: slice.fill }]),
  ) satisfies ChartConfig;

  return (
    <section className="space-y-2" data-testid="shopping-pie">
      <h4 className="font-medium">10 продуктів, на які витрачено найбільше</h4>
      <div className="grid items-center gap-4 sm:grid-cols-[16rem_1fr]">
        <ChartContainer config={config} className="aspect-square h-64">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  nameKey="key"
                  formatter={(value, _name, item) =>
                    `${item.payload.name}: ${money(Number(value))} (${percentText(item.payload.share)})`
                  }
                />
              }
            />
            <Pie
              data={slices}
              dataKey="spent"
              nameKey="key"
              innerRadius="45%"
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="space-y-1 text-sm">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2" data-testid="shopping-pie-item">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-sm"
                style={{ background: slice.fill }}
              />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="tabular-nums">{money(slice.spent)}</span>
              <span className="w-14 text-right text-muted-foreground tabular-nums">
                {percentText(slice.share)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ProductByMonth({ data }: { data: ShoppingPeriod }) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency: data.currency });
  const [selected, setSelected] = useState('');
  // Обраний продукт може зникнути зі зміною періоду — тоді показується найбільший за витратами.
  const product = data.products.find((row) => row.productId === selected) ?? data.products[0];
  if (!product) return null;
  const unit = PRODUCT_UNIT_LABELS[product.unit];

  return (
    <section className="space-y-2" data-testid="shopping-product-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">Продукт по місяцях</h4>
        <div className="w-full sm:w-64">
          <Field label="Продукт для графіка">
            <SelectField
              value={product.productId}
              onChange={setSelected}
              options={data.products.map((row) => ({ value: row.productId, label: row.name }))}
            />
          </Field>
        </div>
      </div>
      <ChartContainer config={spentConfig} className="aspect-auto h-56 w-full">
        <BarChart accessibilityLayer data={product.byMonth}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={shortMonthLabel}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => monthLabel(String(value))}
                formatter={(value, _name, item) =>
                  `${money(Number(value))} · ${formatQuantity(item.payload.quantityMilli)} ${unit}`
                }
              />
            }
          />
          <Bar dataKey="spent" isAnimationActive={false} fill="var(--color-spent)" radius={4} />
        </BarChart>
      </ChartContainer>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {product.byMonth.map((point) => (
          <li key={point.month} data-testid="shopping-product-month">
            {shortMonthLabel(point.month)}:{' '}
            <span className="tabular-nums">{money(point.spent)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
