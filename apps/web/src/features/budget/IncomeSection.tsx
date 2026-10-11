import { formatMoney, type BudgetView } from '@hf/shared';
import { Link } from 'react-router-dom';
import { Button } from '../../shared/ui/button.tsx';
import { Muted } from '../../shared/ui/controls.tsx';
import { formatDateString } from '../../shared/ui/format.ts';
import { OccurrenceStatusLabel } from '../incomes/OccurrenceStatusLabel.tsx';
import { OCCURRENCE_ROW_CLASS } from '../incomes/occurrenceStyles.ts';

/**
 * Доходи місяця в бюджеті — лише перегляд: надходження з індикаторами статусу й сума разових.
 * Додаються, отримуються й редагуються доходи на сторінці «Доходи».
 */
export function IncomeSection({ budget }: { budget: BudgetView }) {
  const { incomes, currency } = budget;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">Доходи</h2>
        <Button variant="outline" asChild>
          <Link to={`/incomes?month=${budget.month}`}>Перейти до доходів</Link>
        </Button>
      </div>

      {incomes.occurrences.length === 0 ? (
        <Muted>Регулярних надходжень цього місяця немає.</Muted>
      ) : (
        <ul className="space-y-2">
          {incomes.occurrences.map((occurrence) => (
            <li
              key={`${occurrence.name}-${occurrence.plannedDate}`}
              data-testid="budget-income-occurrence"
              data-status={occurrence.status}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border p-3 text-sm ${OCCURRENCE_ROW_CLASS[occurrence.status]}`}
            >
              <div>
                <span className="font-medium">{occurrence.name}</span>{' '}
                <span className="text-muted-foreground">
                  · {formatDateString(occurrence.plannedDate)} ·{' '}
                  <span
                    className={`tabular-nums ${occurrence.status === 'skipped' ? 'line-through' : ''}`}
                  >
                    {money(occurrence.plannedAmount)}
                  </span>
                </span>
              </div>
              <OccurrenceStatusLabel occurrence={occurrence} currency={currency} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm" data-testid="budget-one-time-income">
        <span className="text-muted-foreground">Разові доходи: </span>
        <span className="font-medium tabular-nums">{money(incomes.oneTimeTotal)}</span>
      </p>
    </section>
  );
}
