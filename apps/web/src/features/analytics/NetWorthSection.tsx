import { formatMoney, type AnalyticsTrend } from '@hf/shared';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import {
  ChartContainer,
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
import { Figure, Section } from './parts.tsx';
import { signedMoney } from './signedMoney.ts';

const chartConfig = {
  netWorth: { label: 'Чисті активи', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Чисті активи на кінець кожного місяця й частка доходу, що йде на борги. */
export function NetWorthSection({ data }: { data: AnalyticsTrend }) {
  const { currency, plannedDebtLoad } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const last = data.points.at(-1);
  const first = data.points[0];
  const hasDebtPayments =
    plannedDebtLoad.monthlyPayments > 0 || data.points.some((point) => point.debtPayments > 0);

  return (
    <Section
      title="Чисті активи й борги"
      description="Чисті активи — баланси всіх рахунків у гривні мінус залишки позик і розстрочок, на кінець місяця. Борг кредитки вже врахований у балансі її рахунку."
      testId="analytics-net-worth"
    >
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Figure
            title="Чисті активи"
            value={last ? signedMoney(last.netWorth, currency).replace(/^\+/, '') : '—'}
            hint={
              last && first && data.points.length > 1
                ? `${signedMoney(last.netWorth - first.netWorth, currency)} за ${data.months} міс.`
                : undefined
            }
          />
          <Figure
            title="Платежі по боргах цього місяця"
            value={last ? money(last.debtPayments) : '—'}
            hint={
              last && last.debtLoad !== null ? `${percentText(last.debtLoad)} доходу` : undefined
            }
          />
          <Figure
            title="Планове навантаження"
            value={plannedDebtLoad.ratio === null ? '—' : percentText(plannedDebtLoad.ratio)}
            hint={
              plannedDebtLoad.ratio === null
                ? plannedDebtLoad.monthlyPayments > 0
                  ? `${money(plannedDebtLoad.monthlyPayments)} на місяць; запланованого доходу немає`
                  : 'Щомісячних платежів немає'
                : `${money(plannedDebtLoad.monthlyPayments)} із ${money(plannedDebtLoad.plannedIncome)} запланованого доходу`
            }
          />
        </CardContent>
      </Card>

      <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
        <LineChart accessibilityLayer data={data.points} margin={{ left: 12, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            padding={{ left: 24, right: 24 }}
            tickFormatter={shortMonthLabel}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => monthLabel(String(value))}
                formatter={(value) => money(Number(value))}
              />
            }
          />
          <Line
            dataKey="netWorth"
            isAnimationActive={false}
            type="monotone"
            stroke="var(--color-netWorth)"
            strokeWidth={2}
            dot
          />
        </LineChart>
      </ChartContainer>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Місяць</TableHead>
            <TableHead className="text-right">Чисті активи</TableHead>
            {hasDebtPayments && (
              <>
                <TableHead className="text-right">Платежі по боргах</TableHead>
                <TableHead className="text-right">Частка доходу</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.points.map((point) => (
            <TableRow key={point.month} data-testid="net-worth-row" data-month={point.month}>
              <TableCell>{monthLabel(point.month)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {signedMoney(point.netWorth, currency).replace(/^\+/, '')}
              </TableCell>
              {hasDebtPayments && (
                <>
                  <TableCell className="text-right tabular-nums">
                    {money(point.debtPayments)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {point.debtLoad === null ? '—' : percentText(point.debtLoad)}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}
