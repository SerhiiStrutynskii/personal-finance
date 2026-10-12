import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'Потрібно щонайменше 32 символи'),
  /** false закриває реєстрацію нових користувачів; входити можуть лише наявні. */
  REGISTRATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** Каталог зі зібраним фронтендом; якщо задано, API роздає його з того самого домену. */
  WEB_DIST_DIR: z.string().min(1).optional(),
  /** Скільки проксі стоїть перед застосунком: від цього залежить, чию адресу бачить обмеження спроб входу. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Некоректна конфігурація середовища:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
