import type { ComponentProps, ReactNode } from 'react';

/**
 * Рядок списку: назва й деталі ліворуч, сума праворуч; сума ніколи не переноситься.
 * Заміна таблиці на вузькому екрані.
 */
export function ListRow({
  children,
  meta,
  amount,
  note,
  actions,
  className = '',
  ...props
}: {
  meta?: ReactNode;
  amount: ReactNode;
  /** Дрібний підпис під сумою. */
  note?: ReactNode;
  /** Кнопка дій праворуч від суми. */
  actions?: ReactNode;
} & ComponentProps<'li'>) {
  return (
    <li className={`flex items-start justify-between gap-3 ${className}`} {...props}>
      <div className="min-w-0 flex-1 break-words">
        <div>{children}</div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {amount}
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
      {actions && <div className="-my-1.5 -mr-2 shrink-0">{actions}</div>}
    </li>
  );
}
