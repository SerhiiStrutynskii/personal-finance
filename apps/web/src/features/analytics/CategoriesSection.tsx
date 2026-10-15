import { formatMoney, type AnalyticsMonth } from '@hf/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../shared/ui/chart.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { percentText } from '../../shared/ui/format.ts';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { Section } from './parts.tsx';
import { signedMoney } from './signedMoney.ts';

const chartConfig = {
  spent: { label: 'Витрачено', color: 'var(--chart-2)' },
} satisfies ChartConfig;

/** Розподіл витрат місяця за категоріями: стовпчики й таблиця тих самих чисел. */
export function CategoriesSection({ data }: { data: AnalyticsMonth }) {
  const { currency } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const spending = data.categories.filter((row) => row.spent > 0);
  // Групи з підкатегоріями розгортаються; ключ — id групи ('none' для витрат без категорії).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Section
      title="Витрати за категоріями"
      description="Зміна — відносно попереднього місяця. Перекази між рахунками не враховуються."
      testId="analytics-categories"
    >
      {data.categories.length === 0 && <Muted>За цей і попередній місяць витрат немає.</Muted>}
      {spending.length > 0 && (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full"
          style={{ height: spending.length * 36 + 16 }}
        >
          <BarChart accessibilityLayer data={spending} layout="vertical" margin={{ left: 8 }}>
            <XAxis type="number" dataKey="spent" hide />
            <YAxis
              type="category"
              dataKey="categoryName"
              width={140}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent hideLabel formatter={(value) => money(Number(value))} />
              }
            />
            <Bar dataKey="spent" isAnimationActive={false} fill="var(--color-spent)" radius={4} />
          </BarChart>
        </ChartContainer>
      )}
      {data.categories.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Категорія</TableHead>
              <TableHead className="text-right">Витрачено</TableHead>
              <TableHead className="text-right">Частка</TableHead>
              <TableHead className="text-right">Попередній місяць</TableHead>
              <TableHead className="text-right">Зміна</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.categories.map((row) => {
              const key = row.categoryId ?? 'none';
              const isOpen = expanded.has(key);
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              const numbers = (
                item: Pick<typeof row, 'spent' | 'share' | 'previousSpent' | 'change'>,
              ) => (
                <>
                  <TableCell className="text-right tabular-nums">{money(item.spent)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percentText(item.share)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(item.previousSpent)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {signedMoney(item.change, currency)}
                  </TableCell>
                </>
              );
              return (
                <Fragment key={key}>
                  <TableRow>
                    <TableCell>
                      {row.subcategories ? (
                        <button
                          type="button"
                          className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 hover:bg-muted"
                          aria-expanded={isOpen}
                          onClick={() => toggle(key)}
                        >
                          <Chevron className="size-4 text-muted-foreground" aria-hidden />
                          {row.categoryName}
                        </button>
                      ) : (
                        row.categoryName
                      )}
                    </TableCell>
                    {numbers(row)}
                  </TableRow>
                  {isOpen &&
                    row.subcategories?.map((child) => (
                      <TableRow
                        key={`${key}:${child.categoryId}:${child.categoryName}`}
                        className="text-muted-foreground"
                        data-testid="analytics-subcategory"
                      >
                        <TableCell className="pl-9">{child.categoryName}</TableCell>
                        {numbers(child)}
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Разом</TableCell>
              <TableCell className="text-right tabular-nums">{money(data.totalSpent)}</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {money(data.previousTotalSpent)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {signedMoney(data.change, currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </Section>
  );
}
