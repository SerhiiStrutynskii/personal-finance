import { runMigrations } from '../db/migrate.ts';
import { testDatabaseUrl } from './database-url.ts';

export default async function setup(): Promise<void> {
  await runMigrations(testDatabaseUrl());
}
