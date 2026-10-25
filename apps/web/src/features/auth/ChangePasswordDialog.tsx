import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../shared/ui/button.tsx';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog.tsx';
import { Input } from '../../shared/ui/input.tsx';
import { useAuth } from './authContext.ts';
import {
  NEW_PASSWORD_HINT,
  PASSWORD_CHANGED_MESSAGE,
  changePasswordErrorsFromServer,
  emptyChangePasswordValues,
  validateChangePassword,
  type ChangePasswordErrors,
  type ChangePasswordValues,
} from './changePasswordForm.ts';

const NOTICE_MS = 8000;

/** Пункт меню «Змінити пароль» із формою в модальному вікні; `trigger` — вигляд пункту. */
export function ChangePasswordDialog({ trigger }: { trigger: ReactNode }) {
  const { changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ChangePasswordValues>(emptyChangePasswordValues);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!changed) return;
    const timer = setTimeout(() => setChanged(false), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [changed]);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    // Паролі не лишаються в пам'яті форми ні після закриття, ні до наступного відкриття.
    setValues(emptyChangePasswordValues);
    setErrors({});
    if (next) setChanged(false);
  }

  const set = (field: keyof ChangePasswordValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validateChangePassword(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await changePassword(result.input);
      setValues(emptyChangePasswordValues);
      setOpen(false);
      setChanged(true);
    } catch (error) {
      setErrors(changePasswordErrorsFromServer(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>Зміна пароля</DialogTitle>
              <DialogDescription>
                Після зміни інші пристрої вийдуть із системи; на цьому ви лишитеся.
              </DialogDescription>
            </DialogHeader>
            <PasswordField
              label="Поточний пароль"
              autoComplete="current-password"
              autoFocus
              value={values.currentPassword}
              error={errors.currentPassword}
              onChange={set('currentPassword')}
            />
            <PasswordField
              label="Новий пароль"
              autoComplete="new-password"
              value={values.newPassword}
              error={errors.newPassword}
              hint={NEW_PASSWORD_HINT}
              onChange={set('newPassword')}
            />
            <PasswordField
              label="Повторіть новий пароль"
              autoComplete="new-password"
              value={values.confirmPassword}
              error={errors.confirmPassword}
              onChange={set('confirmPassword')}
            />
            <ErrorText>{errors.form}</ErrorText>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={pending}>
                  Скасувати
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                Змінити пароль
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {changed &&
        createPortal(
          <div
            role="status"
            className="fixed inset-x-3 bottom-3 z-[60] rounded-lg bg-black px-4 py-3 text-sm text-white shadow-lg sm:left-auto sm:max-w-sm"
          >
            {PASSWORD_CHANGED_MESSAGE}
          </div>,
          document.body,
        )}
    </>
  );
}

function PasswordField({
  label,
  hint,
  error,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  label: string;
  hint?: string;
  error: string | undefined;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
}) {
  const hintId = useId();
  const showHint = hint && !error;
  // Підказка поза підписом: інакше вона стала б частиною назви поля.
  return (
    <div className="grid gap-1.5">
      <Field label={label} error={error}>
        <Input
          type="password"
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={256}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={showHint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      {showHint && (
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}
