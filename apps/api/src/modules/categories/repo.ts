import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.ts';
import { categories } from '../../db/schema.ts';
import type { CreateCategoryInput, UpdateCategoryInput } from './schema.ts';

export type CategoryRow = typeof categories.$inferSelect;

const owned = (householdId: string, id: string) =>
  and(eq(categories.householdId, householdId), eq(categories.id, id));

export function listCategories(db: Db, householdId: string): Promise<CategoryRow[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(asc(categories.kind), asc(categories.name));
}

export async function findCategory(db: Db, householdId: string, id: string) {
  const [row] = await db.select().from(categories).where(owned(householdId, id));
  return row;
}

export async function insertCategory(db: Db, householdId: string, input: CreateCategoryInput) {
  const [row] = await db
    .insert(categories)
    .values({ ...input, householdId })
    .returning();
  return row!;
}

export async function updateCategory(
  db: Db,
  householdId: string,
  id: string,
  input: UpdateCategoryInput,
) {
  const [row] = await db
    .update(categories)
    .set({ name: input.name })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteCategory(db: Db, householdId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(categories)
    .where(owned(householdId, id))
    .returning({ id: categories.id });
  return rows.length > 0;
}
