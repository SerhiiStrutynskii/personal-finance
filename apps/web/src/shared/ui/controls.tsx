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

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
