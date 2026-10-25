import { cn } from '../../shared/lib/utils.ts';
import { Badge } from '../../shared/ui/badge.tsx';
import { unpricedLabel } from './dishForm.ts';

/**
 * Позначка, що в ціні бракує продуктів без ціни. hint замінює підказку («2 продукти без ціни»);
 * compact — лише значок «!» для тісних місць (клітинка календаря).
 */
export function IncompletePriceBadge({
  unpricedCount = 0,
  hint = unpricedLabel(unpricedCount),
  compact = false,
}: {
  unpricedCount?: number;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      title={hint}
      data-testid="incomplete-price"
      className={cn(compact && 'h-4 px-1 text-[10px]')}
    >
      {compact ? (
        <>
          <span aria-hidden>!</span>
          <span className="sr-only">Ціна неповна</span>
        </>
      ) : (
        'Ціна неповна'
      )}
      <span className="sr-only">: {hint}</span>
    </Badge>
  );
}
