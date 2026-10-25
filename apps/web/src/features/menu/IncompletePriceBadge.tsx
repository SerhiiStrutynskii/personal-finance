import { Badge } from '../../shared/ui/badge.tsx';
import { unpricedLabel } from './dishForm.ts';

/** Позначка, що в ціні порції бракує продуктів без ціни. */
export function IncompletePriceBadge({ unpricedCount }: { unpricedCount: number }) {
  const hint = unpricedLabel(unpricedCount);
  return (
    <Badge variant="outline" title={hint} data-testid="incomplete-price">
      Ціна неповна
      <span className="sr-only">: {hint}</span>
    </Badge>
  );
}
