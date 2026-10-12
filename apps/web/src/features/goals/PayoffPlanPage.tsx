import { formatMoney, type Goal } from '@hf/shared';
import { ArrowLeft, Info } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { errorMessage } from '../../shared/api/index.ts';
import { Button } from '../../shared/ui/button.tsx';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../../shared/ui/chart.tsx';
import { ErrorText, Field, Muted } from '../../shared/ui/controls.tsx';
import {
  formatDateString,
  monthLabel,
  percentText,
  shortMonthLabel,
} from '../../shared/ui/format.ts';
import { Input } from '../../shared/ui/input.tsx';
import { Progress } from '../../shared/ui/progress.tsx';
import { SelectField } from '../../shared/ui/select-field.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../shared/ui/table.tsx';
import { parsePlannedAmount, plannedAmountText } from '../budget/plannedAmount.ts';
import { monthsText } from '../debts/labels.ts';
import { useGoal, usePayoffPlan, useSaveGoal, type PayoffStrategy } from './api.ts';
import { GoalStateLabel } from './GoalStateLabel.tsx';
import { STRATEGIES, STRATEGY_LABELS } from './labels.ts';

type DebtPayoffGoal = Extract<Goal, { kind: 'debt_payoff' }>;

export function PayoffPlanPage() {
  const { id = '' } = useParams();
  const goal = useGoal(id);

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        to="/goals"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Усі цілі
      </Link>
      <ErrorText>{goal.isError && errorMessage(goal.error)}</ErrorText>
      {goal.isPending && <Muted>Завантаження…</Muted>}
      {goal.data?.kind === 'savings' && (
        <Muted>План погашення є лише в цілі виходу з боргів.</Muted>
      )}
      {/* key скидає поля плану, коли збережені значення цілі змінюються */}
      {goal.data?.kind === 'debt_payoff' && (
        <PlanContent key={`${goal.data.extraPayment}-${goal.data.strategy}`} goal={goal.data} />
      )}
    </div>
  );
}

const chartConfig = {
  balance: { label: 'Залишок боргів', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Скільки рядків залишку показує таблиця; решту видно на графіку. */
const TABLE_ROWS = 24;

function Figure({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}

function PlanContent({ goal }: { goal: DebtPayoffGoal }) {
  const { currency } = goal;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const save = useSaveGoal();
  const [extraText, setExtraText] = useState(plannedAmountText(goal.extraPayment, currency));
  const [strategy, setStrategy] = useState<PayoffStrategy>(goal.strategy);

  // Поки в полі помилка, план показується для збереженого платежу цілі.
  const parsed = extraText.trim() === '' ? 0 : parsePlannedAmount(extraText, currency);
  const extra = typeof parsed === 'number' ? parsed : goal.extraPayment;

  const query = usePayoffPlan(goal.id, extra, strategy);
  const data = query.data;
  const changed = extra !== goal.extraPayment || strategy !== goal.strategy;
  const onTime =
    data?.plan.debtFreeMonth != null && data.plan.debtFreeMonth <= goal.targetDate.slice(0, 7);

  return (
    <>
      <div>
        <h1 className="font-heading text-xl font-semibold">{goal.name}</h1>
        {goal.description && <p className="mt-1 text-sm">{goal.description}</p>}
      </div>

      <Card>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2" data-testid="goal-progress">
            <span>
              Погашено {money(goal.paid)} з {money(goal.startBalance)} · лишилося{' '}
              {money(goal.currentBalance)}
            </span>
            <span className="tabular-nums">{percentText(goal.progress)}</span>
          </div>
          <Progress
            className="h-1.5"
            value={goal.progress * 100}
            aria-label="Погашено від стартового боргу"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GoalStateLabel goal={goal} />
            <span className="text-muted-foreground">
              Мінімальні платежі {money(goal.minimumPayments)} на місяць
              {goal.requiredMonthly !== null &&
                ` · щоб встигнути до ${formatDateString(goal.targetDate)}, потрібно ${money(goal.requiredMonthly)}`}
            </span>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">План погашення</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={`Додатковий платіж на місяць, ${currency}`}
            error={typeof parsed === 'string' ? parsed : undefined}
          >
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={extraText}
              aria-invalid={typeof parsed === 'string' ? true : undefined}
              onChange={(e) => setExtraText(e.target.value)}
            />
          </Field>
          <Field label="Стратегія">
            <SelectField
              value={strategy}
              onChange={setStrategy}
              options={STRATEGIES.map((value) => ({ value, label: STRATEGY_LABELS[value] }))}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!changed || typeof parsed !== 'number' || save.isPending}
            onClick={() => save.mutate({ id: goal.id, input: { extraPayment: extra, strategy } })}
          >
            Зберегти як план цілі
          </Button>
          {!changed && <Muted>Це збережений план цілі.</Muted>}
        </div>
        <ErrorText>{save.isError && errorMessage(save.error)}</ErrorText>
        <ErrorText>{query.isError && errorMessage(query.error)}</ErrorText>
      </section>

      {data && (
        <>
          <Card data-testid="payoff-summary">
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Figure
                  title="Вихід із боргів"
                  value={data.plan.debtFreeMonth ? monthLabel(data.plan.debtFreeMonth) : '—'}
                  hint={
                    data.plan.months === null
                      ? 'За такого плану борги не погашаються'
                      : `за ${monthsText(data.plan.months)} · ${onTime ? 'встигаєте до' : 'пізніше за'} ${formatDateString(goal.targetDate)}`
                  }
                />
                <Figure
                  title="Відсотків буде сплачено"
                  value={data.plan.totalInterest === null ? '—' : money(data.plan.totalInterest)}
                />
                <Figure
                  title="Проти мінімальних платежів"
                  value={
                    data.monthsSaved === null
                      ? '—'
                      : data.monthsSaved > 0
                        ? `на ${monthsText(data.monthsSaved)} раніше`
                        : 'той самий строк'
                  }
                  hint={
                    data.interestSaved !== null && data.interestSaved > 0
                      ? `на ${money(data.interestSaved)} менше відсотків`
                      : undefined
                  }
                />
              </div>
              {data.baseline.months === null && (
                <p className="text-sm text-status-over">
                  Лише мінімальними платежами ці борги не погашаються: платіж не покриває відсотки.
                </p>
              )}
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  План — це розрахунок за поточними залишками, ставками й платежами. Він припускає,
                  що нових покупок по кредитках не буде, і не є фінансовою порадою.
                </span>
              </p>
            </CardContent>
          </Card>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold">Порядок погашення</h2>
            {data.plan.payoffOrder.length === 0 && <Muted>Боргів із залишком немає.</Muted>}
            <ol className="divide-y text-sm" data-testid="payoff-order">
              {data.plan.payoffOrder.map((item, index) => (
                <li key={item.debtId} className="flex justify-between gap-4 py-2">
                  <span>
                    {index + 1}. {item.name}
                  </span>
                  <span className="tabular-nums">{monthLabel(item.month)}</span>
                </li>
              ))}
            </ol>
            {data.withoutExtra.length > 0 && (
              <Muted>
                Без додаткових платежів, бо умови не передбачають дострокового погашення:{' '}
                {data.withoutExtra.map((item) => item.name).join(', ')}.
              </Muted>
            )}
          </section>

          {data.plan.timeline.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-heading text-lg font-semibold">Залишок боргів по місяцях</h2>
              <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
                <LineChart
                  accessibilityLayer
                  data={data.plan.timeline}
                  margin={{ left: 12, right: 12, top: 8 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
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
                    dataKey="balance"
                    type="monotone"
                    stroke="var(--color-balance)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Місяць</TableHead>
                    <TableHead className="text-right">Залишок на кінець місяця</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.plan.timeline.slice(0, TABLE_ROWS).map((point) => (
                    <TableRow key={point.month}>
                      <TableCell>{monthLabel(point.month)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(point.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.plan.timeline.length > TABLE_ROWS && (
                <Muted>
                  Показано перші {TABLE_ROWS} місяців із {data.plan.timeline.length}.
                </Muted>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
