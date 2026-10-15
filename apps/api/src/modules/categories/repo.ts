import { SYSTEM_CATEGORY_NAMES, type SystemCategoryKey } from '@hf/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { categories } from '../../db/schema.ts';
import type { CreateCategoryInput, UpdateCategoryInput } from './schema.ts';

export type CategoryRow = typeof categories.$inferSelect;

const owned = (householdId: string, id: string) =>
  and(eq(categories.householdId, householdId), eq(categories.id, id));

export function listCategories(db: DbOrTx, householdId: string): Promise<CategoryRow[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(asc(categories.kind), asc(categories.name));
}

export async function findCategory(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(categories).where(owned(householdId, id));
  return row;
}

/** Підкатегорії категорії. */
export function listChildren(db: DbOrTx, householdId: string, parentId: string) {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.householdId, householdId), eq(categories.parentId, parentId)));
}

export async function insertCategory(db: DbOrTx, householdId: string, input: CreateCategoryInput) {
  const [row] = await db
    .insert(categories)
    .values({ ...input, householdId })
    .returning();
  return row!;
}

export async function updateCategory(
  db: DbOrTx,
  householdId: string,
  id: string,
  input: UpdateCategoryInput,
) {
  const patch = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.parentId !== undefined && { parentId: input.parentId }),
  };
  const [row] = await db.update(categories).set(patch).where(owned(householdId, id)).returning();
  return row;
}

export async function deleteCategory(
  db: DbOrTx,
  householdId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(categories)
    .where(owned(householdId, id))
    .returning({ id: categories.id });
  return rows.length > 0;
}

/**
 * Системна категорія витрат домогосподарства; створюється за першої потреби.
 * Якщо користувач уже має звичайну категорію з такою назвою, системною стає вона.
 */
export async function ensureSystemCategory(
  db: DbOrTx,
  householdId: string,
  key: SystemCategoryKey,
): Promise<CategoryRow> {
  const bySystemKey = and(eq(categories.householdId, householdId), eq(categories.systemKey, key));
  const [existing] = await db.select().from(categories).where(bySystemKey);
  if (existing) return existing;

  const name = SYSTEM_CATEGORY_NAMES[key];
  const [adopted] = await db
    .update(categories)
    .set({ systemKey: key })
    .where(
      and(
        eq(categories.householdId, householdId),
        eq(categories.kind, 'expense'),
        eq(categories.name, name),
        isNull(categories.systemKey),
        // Підкатегорія з такою назвою системною не стає: системні — лише верхнього рівня.
        isNull(categories.parentId),
      ),
    )
    .returning();
  if (adopted) return adopted;

  // Паралельний запит міг створити категорію раніше — тоді вставка нічого не робить.
  await db
    .insert(categories)
    .values({ householdId, name, kind: 'expense', systemKey: key })
    .onConflictDoNothing();
  const [created] = await db.select().from(categories).where(bySystemKey);
  return created!;
}
