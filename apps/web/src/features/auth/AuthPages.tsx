import { PASSWORD_MIN_LENGTH, loginSchema, registerSchema } from '@hf/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, errorMessage } from '../../shared/api/index.ts';
import { ErrorText, Field } from '../../shared/ui/controls.tsx';
import { useAuth } from './authContext.ts';
import { Button } from '../../shared/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../shared/ui/card.tsx';
import { Input } from '../../shared/ui/input.tsx';

function AuthLayout({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardDescription>Prospera</CardDescription>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          <p>{footer}</p>
        </CardFooter>
      </Card>
    </main>
  );
}

/**
 * Чи відкрита реєстрація на цьому сервері. Поки відповіді немає — undefined,
 * і посилання на реєстрацію не показується.
 */
function useRegistrationEnabled(): boolean | undefined {
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: () =>
      api.get<{ registrationEnabled: boolean }>('/api/auth/config', undefined, { auth: false }),
    staleTime: 'static',
  });
  return config.data?.registrationEnabled;
}

function useSubmit(action: () => Promise<void>) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }
  return { error, setError, pending, submit };
}

export function LoginPage() {
  const { login } = useAuth();
  const registrationEnabled = useRegistrationEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { error, pending, submit } = useSubmit(async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) throw new Error('Введіть email і пароль');
    await login(parsed.data);
  });

  return (
    <AuthLayout
      title="Вхід"
      footer={
        registrationEnabled ? (
          <>
            Ще немає облікового запису?{' '}
            <Link className="underline" to="/register">
              Зареєструватися
            </Link>
          </>
        ) : (
          registrationEnabled === false && 'Реєстрацію нових користувачів закрито.'
        )
      }
    >
      <form className="space-y-3" onSubmit={submit} noValidate>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Пароль">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={pending}>
          Увійти
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const registrationEnabled = useRegistrationEnabled();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { error, pending, submit } = useSubmit(async () => {
    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
      setFieldErrors({
        ...(fields.has('name') && { name: 'Вкажіть імʼя' }),
        ...(fields.has('email') && { email: 'Некоректний email' }),
        ...(fields.has('password') && {
          password: `Пароль має містити щонайменше ${PASSWORD_MIN_LENGTH} символів`,
        }),
      });
      throw new Error('Перевірте заповнення полів');
    }
    setFieldErrors({});
    await register(parsed.data);
  });

  // Реєстрацію закрито на сервері — показувати форму немає сенсу.
  if (registrationEnabled === false) return <Navigate to="/login" replace />;

  return (
    <AuthLayout
      title="Реєстрація"
      footer={
        <>
          Уже є обліковий запис?{' '}
          <Link className="underline" to="/login">
            Увійти
          </Link>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit} noValidate>
        <Field label="Імʼя" error={fieldErrors.name}>
          <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Пароль" error={fieldErrors.password}>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={pending}>
          Зареєструватися
        </Button>
      </form>
    </AuthLayout>
  );
}
