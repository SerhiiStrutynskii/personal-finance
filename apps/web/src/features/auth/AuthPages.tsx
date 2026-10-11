import { PASSWORD_MIN_LENGTH, loginSchema, registerSchema } from '@hf/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/index.ts';
import { Button, ErrorText, Field } from '../../shared/ui/controls.tsx';
import { inputClass } from '../../shared/ui/styles.ts';
import { useAuth } from './authContext.ts';

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
    <main className="flex min-h-screen items-center justify-center bg-[#f3f5f7] p-4">
      <div className="w-full max-w-sm rounded-md border-2 border-black/10 bg-white p-6 shadow-sm">
        <p className="mb-1 text-lg font-bold">Prospera</p>
        <h1 className="mb-4 text-xl">{title}</h1>
        {children}
        <p className="mt-4 text-sm text-black/60">{footer}</p>
      </div>
    </main>
  );
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
        <>
          Ще немає облікового запису?{' '}
          <Link className="underline" to="/register">
            Зареєструватися
          </Link>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit} noValidate>
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Пароль">
          <input
            className={inputClass}
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
          <input
            className={inputClass}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Пароль" error={fieldErrors.password}>
          <input
            className={inputClass}
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
