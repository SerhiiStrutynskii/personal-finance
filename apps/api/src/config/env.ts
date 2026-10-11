import { z } from 'zod';

const envSchema = z.object({
  // Без явного NODE_ENV вважаємо середовище бойовим, щоб dev-спрощення не ввімкнулися випадково.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DEV_USER_ID: z.uuid().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Некоректна конфігурація середовища:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
