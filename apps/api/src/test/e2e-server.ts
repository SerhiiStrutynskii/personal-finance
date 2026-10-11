import { sql } from 'drizzle-orm';
import { createApp } from '../app.ts';
import { createDb } from '../db/client.ts';
import { runMigrations } from '../db/migrate.ts';
import { testDatabaseUrl } from './database-url.ts';

// API для E2E-тестів: працює на тестовій базі, яку очищає перед запуском.
const port = Number(process.env.E2E_API_PORT ?? 3100);
const corsOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:5174';

const url = testDatabaseUrl();
await runMigrations(url);
const { db } = createDb(url);
await db.execute(sql`TRUNCATE users, households RESTART IDENTITY CASCADE`);

createApp({ db, corsOrigin, jwtSecret: 'e2e-secret-e2e-secret-e2e-secret-1234' }).listen(
  port,
  () => {
    console.log(`E2E API слухає порт ${port}`);
  },
);
