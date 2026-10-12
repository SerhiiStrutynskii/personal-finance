import { formatMoney, type DebtProjection } from '@hf/shared';
import { CircleAlert, Info } from 'lucide-react';
import { formatDateString } from '../../shared/ui/format.ts';
import { monthsText } from './labels.ts';

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-status-over">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Прогноз погашення з попередженнями про строк і про платіж, що не покриває відсотки. */
export function ProjectionInfo({
  projection,
  maturityDate,
  currency,
}: {
  projection: DebtProjection;
  maturityDate: string | null;
  currency: string;
}) {
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency });

  return (
    <div className="space-y-1.5 text-sm" data-testid="debt-projection">
      {projection.months === 0 && <p>Борг погашено.</p>}
      {projection.months !== null && projection.months > 0 && projection.payoffDate && (
        <p>
          Погашення за {monthsText(projection.months)}, останній платіж{' '}
          {formatDateString(projection.payoffDate)}
          {projection.totalInterest !== null && projection.totalInterest > 0 && (
            <>; відсотків ще буде сплачено {money(projection.totalInterest)}</>
          )}
          .
        </p>
      )}
      {!projection.paymentCoversInterest && (
        <Warning>Платіж не покриває відсотки, борг не зменшується.</Warning>
      )}
      {projection.paymentCoversInterest && projection.months === null && (
        <Warning>За такого платежу борг не буде погашено й за 50 років.</Warning>
      )}
      {projection.maturityWarning && maturityDate && (
        <Warning>
          За поточного платежу борг не буде погашено до {formatDateString(maturityDate)}. Щоб
          встигнути, потрібен платіж {money(projection.maturityWarning.requiredPayment)} на місяць.
        </Warning>
      )}
      {projection.assumesNoNewPurchases && (
        <p className="flex items-start gap-1.5 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Прогноз припускає, що нових покупок по картці не буде.</span>
        </p>
      )}
    </div>
  );
}
