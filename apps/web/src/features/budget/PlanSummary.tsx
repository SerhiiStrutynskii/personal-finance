import { formatMoney, type PlanState } from '@hf/shared';
import { Check, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../../shared/ui/card.tsx';
import { signedMoney } from '../analytics/signedMoney.ts';

interface Props {
  plannedIncome: number;
  /** Сума лімітів; null, якщо бюджету на місяць немає. */
  plannedExpenses: number | null;
  /** Стан плану, який порахував бекенд; null без бюджету. */
  state: PlanState | null;
  currency: string;
}

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** План місяця: очікувані прибутки, очікувані витрати й чи сходиться бюджет. */
export function PlanSummary({ plannedIncome, plannedExpenses, state, currency }: Props) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });
  const balance = plannedExpenses === null ? null : plannedIncome - plannedExpenses;

  return (
    <Card data-testid="month-plan" data-state={state ?? 'none'}>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Figure title="Очікувані прибутки" value={money(plannedIncome)} />
          <Figure
            title="Очікувані витрати"
            value={plannedExpenses === null ? '—' : money(plannedExpenses)}
          />
          <Figure title="Різниця" value={balance === null ? '—' : signedMoney(balance, currency)} />
        </div>
        {/* Статус словами й іконкою: колір ніколи не є єдиною ознакою. */}
        {state === 'balanced' && balance !== null && (
          <p className="flex items-start gap-1.5 text-sm font-medium text-status-surplus">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {balance > 0
                ? `Бюджет сходиться: після запланованих витрат лишається ${money(balance)}.`
                : 'Бюджет сходиться: заплановані витрати дорівнюють прибуткам.'}
            </span>
          </p>
        )}
        {state === 'deficit' && balance !== null && (
          <p className="flex items-start gap-1.5 text-sm font-medium text-status-over">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Бюджет не сходиться: заплановані витрати більші за прибутки на {money(-balance)}.
            </span>
          </p>
        )}
        {state === null && (
          <p className="text-sm text-muted-foreground">
            На цей місяць немає бюджету, тож очікувані витрати невідомі.{' '}
            <Link className="underline underline-offset-4" to="/budget">
              Створити бюджет
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
