import { formatMoney, type AnalyticsMonth } from '@hf/shared';
import { Check, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { Figure, Section } from './parts.tsx';

/** Перевитрати за бюджетом місяця і прогноз витрат до кінця поточного місяця. */
export function OverspendingSection({ data }: { data: AnalyticsMonth }) {
  const { currency, budget, forecast } = data;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const atRisk = (forecast?.categories ?? []).filter(
    // Уже перевищені категорії показані вище; тут — ті, що перевищать ліміт за поточного темпу.
    (row) => row.projectedOverBy > 0 && row.spent <= row.planned,
  );
  const overPlan =
    forecast && forecast.plannedExpenseTotal !== null
      ? forecast.projected - forecast.plannedExpenseTotal
      : null;

  return (
    <Section title="Перевитрати й прогноз" testId="analytics-overspending">
      {!budget && (
        <Muted>
          На цей місяць немає бюджету, тому перевитрати не рахуються.{' '}
          <Link className="underline underline-offset-4" to="/budget">
            Перейти до бюджету
          </Link>
        </Muted>
      )}
      {budget && budget.overspent.length === 0 && (
        <p className="inline-flex items-center gap-1 text-sm font-medium text-status-surplus">
          <Check className="size-4" aria-hidden />
          Жоден ліміт не перевищено
        </p>
      )}
      {budget && budget.overspent.length > 0 && (
        <ul className="space-y-2">
          {budget.overspent.map((row) => (
            <li
              key={row.categoryId ?? 'none'}
              className="rounded-lg border border-status-over bg-status-over/10 p-3 text-sm"
              data-testid="overspent-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.categoryName}</span>
                <span className="inline-flex items-center gap-1 font-medium text-status-over">
                  <TriangleAlert className="size-4" aria-hidden />
                  Перевищено на {money(row.overBy)}
                </span>
              </div>
              <div className="text-muted-foreground">
                {row.planned > 0
                  ? `Витрачено ${money(row.spent)} з ліміту ${money(row.planned)}`
                  : `Витрачено ${money(row.spent)} без ліміту`}
              </div>
            </li>
          ))}
        </ul>
      )}

      {forecast && (
        <Card data-testid="analytics-forecast">
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Figure
                title="Витрачено"
                value={money(forecast.spent)}
                hint={`за ${forecast.daysElapsed} з ${forecast.daysInMonth} днів`}
              />
              <Figure title="Прогноз на кінець місяця" value={money(forecast.projected)} />
              <Figure
                title="Сума лімітів"
                value={
                  forecast.plannedExpenseTotal === null ? '—' : money(forecast.plannedExpenseTotal)
                }
              />
            </div>
            {overPlan !== null && overPlan > 0 && (
              <p className="flex items-start gap-1.5 text-sm text-status-over">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  За поточного темпу витрати перевищать суму лімітів на {money(overPlan)}.
                </span>
              </p>
            )}
            {atRisk.length > 0 && (
              <div className="text-sm">
                <div className="mb-1 font-medium">За поточного темпу ліміт перевищать:</div>
                <ul className="divide-y">
                  {atRisk.map((row) => (
                    <li
                      key={row.categoryId ?? 'none'}
                      className="flex flex-wrap justify-between gap-2 py-1"
                      data-testid="forecast-risk-row"
                    >
                      <span>{row.categoryName}</span>
                      <span className="tabular-nums">
                        прогноз {money(row.projected)} з ліміту {money(row.planned)} · на{' '}
                        {money(row.projectedOverBy)} більше
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Прогноз — це поточний середній темп витрат, продовжений до кінця місяця. Він не
                враховує, що великі платежі бувають раз на місяць.
              </span>
            </p>
          </CardContent>
        </Card>
      )}
    </Section>
  );
}
