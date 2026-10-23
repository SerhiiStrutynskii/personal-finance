import type { ReactNode } from 'react';

/** Блок аналітики із заголовком і коротким поясненням. */
export function Section({
  title,
  description,
  testId,
  children,
}: {
  title: string;
  description?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div>
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
