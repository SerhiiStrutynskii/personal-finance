import type { ReactNode } from 'react';
import { Alert, AlertDescription } from './alert.tsx';
import { Label } from './label.tsx';

/** Поле форми з підписом і повідомленням про помилку. */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Label className="flex-col items-stretch gap-1.5 font-normal">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-destructive">{error}</span>}
    </Label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** level 2 — для сторінок усередині модуля зі спільним заголовком (як «Меню» з табами). */
export function PageHeader({
  title,
  action,
  level = 1,
}: {
  title: ReactNode;
  action?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <Heading className="font-heading text-xl font-semibold">{title}</Heading>
      {action}
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
