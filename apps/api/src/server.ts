import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { createDb } from './db/client.ts';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

const app = createApp({
  db,
  corsOrigin: env.CORS_ORIGIN,
  devAuth: { enabled: env.NODE_ENV !== 'production', defaultUserId: env.DEV_USER_ID },
});

const server = app.listen(env.PORT, () => {
  console.log(`API слухає порт ${env.PORT} (${env.NODE_ENV})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end());
  });
}
