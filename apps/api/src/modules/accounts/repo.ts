import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { accounts } from '../../db/schema.ts';
import type { CreateAccountInput, UpdateAccountInput } from './schema.ts';

export type AccountRow = typeof accounts.$inferSelect;

const owned = (householdId: string, id: string) =>
  and(eq(accounts.householdId, householdId), eq(accounts.id, id));

export function listAccounts(db: Db, householdId: string): Promise<AccountRow[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.householdId, householdId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
}

export async function findAccount(db: Db, householdId: string, id: string) {
  const [row] = await db.select().from(accounts).where(owned(householdId, id));
  return row;
}

export function findAccountsByIds(db: Db, householdId: string, ids: string[]) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), inArray(accounts.id, ids)));
}

export async function insertAccount(db: Db, householdId: string, input: CreateAccountInput) {
  const [row] = await db
    .insert(accounts)
    .values({ ...input, householdId })
    .returning();
  return row!;
}

export async function updateAccount(
  db: Db,
  householdId: string,
  id: string,
  input: UpdateAccountInput,
) {
  const patch = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.type !== undefined && { type: input.type }),
  };
  const [row] = await db.update(accounts).set(patch).where(owned(householdId, id)).returning();
  return row;
}

export async function deleteAccount(db: Db, householdId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(accounts)
    .where(owned(householdId, id))
    .returning({ id: accounts.id });
  return rows.length > 0;
}
