/**
 * Підписана сума в зведенні. `compact` — на телефоні рядком «назва … сума» меншим шрифтом,
 * щоб блок із кількома сумами не розтягувався на екран; від sm — як звичайна.
 */
export function Figure({
  title,
  value,
  hint,
  compact = false,
}: {
  title: string;
  value: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? 'flex flex-wrap items-baseline justify-between gap-x-4 sm:block' : ''}
    >
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className={`font-semibold tabular-nums ${compact ? 'text-base sm:text-xl' : 'text-xl'}`}>
        {value}
      </div>
      {hint && <div className="w-full text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}
