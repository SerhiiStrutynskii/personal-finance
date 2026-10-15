import { formatMoney, type AnalyticsTrend } from '@hf/shared';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../shared/ui/chart.tsx';
import { monthLabel, percentText, shortMonthLabel } from '../../shared/ui/format.ts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { Section } from './parts.tsx';
import { signedMoney } from './signedMoney.ts';

const chartConfig = {
  income: { label: 'Прибуток', color: 'var(--status-surplus)' },
  expenses: { label: 'Витрати', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Прибутки й витрати по місяцях: стовпчики й таблиця з різницею та нормою заощаджень. */
export function TrendSection({ data }: { data: AnalyticsTrend }) {
  const { currency } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <Section
      title="Прибутки й витрати"
      description="Норма заощаджень — частка прибутку, що лишилася після витрат."
      testId="analytics-trend"
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
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
                formatter={(value, name) =>
                  `${chartConfig[name as keyof typeof chartConfig]?.label ?? name}: ${money(Number(value))}`
                }
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="income" isAnimationActive={false} fill="var(--color-income)" radius={4} />
          <Bar
            dataKey="expenses"
            isAnimationActive={false}
            fill="var(--color-expenses)"
            radius={4}
          />
        </BarChart>
      </ChartContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Місяць</TableHead>
            <TableHead className="text-right">Прибуток</TableHead>
            <TableHead className="text-right">Витрати</TableHead>
            <TableHead className="text-right">Різниця</TableHead>
            <TableHead className="text-right">Норма заощаджень</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.points.map((point) => (
            <TableRow key={point.month} data-testid="trend-row" data-month={point.month}>
              <TableCell>{monthLabel(point.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(point.income)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(point.expenses)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {signedMoney(point.net, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {point.savingsRate === null ? '—' : percentText(point.savingsRate)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}
