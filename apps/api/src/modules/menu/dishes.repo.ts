import { productNameKey, type DishIngredientInput } from '@hf/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { dishIngredients, dishes, products } from '../../db/schema.ts';

export type DishRow = typeof dishes.$inferSelect;
/** Рядок складу разом із назвою, одиницею й поточною ціною продукту. */
export interface IngredientWithProduct {
  dishId: string;
  productId: string;
  quantityMilli: number;
  name: string;
  unit: (typeof products.$inferSelect)['unit'];
  priceMinor: number | null;
  isArchived: boolean;
}

const owned = (householdId: string, id: string) =>
  and(eq(dishes.householdId, householdId), eq(dishes.id, id));

/**
 * Страви домогосподарства (одна страва за id або набір за масивом id) з рядками складу в порядку
 * position. Без сортування страв: порядок за українським алфавітом задає сервіс.
 */
export async function listWithIngredients(
  db: DbOrTx,
  householdId: string,
  dishId?: string | readonly string[],
): Promise<{ dishes: DishRow[]; ingredients: IngredientWithProduct[] }> {
  if (Array.isArray(dishId) && dishId.length === 0) return { dishes: [], ingredients: [] };
  const filter =
    dishId === undefined
      ? eq(dishes.householdId, householdId)
      : typeof dishId === 'string'
        ? owned(householdId, dishId)
        : and(eq(dishes.householdId, householdId), inArray(dishes.id, [...dishId]));
  const rows = await db.select().from(dishes).where(filter);
  if (rows.length === 0) return { dishes: [], ingredients: [] };

  const ingredients = await db
    .select({
      dishId: dishIngredients.dishId,
      productId: dishIngredients.productId,
      quantityMilli: dishIngredients.quantityMilli,
      name: products.name,
      unit: products.unit,
      priceMinor: products.priceMinor,
      isArchived: products.isArchived,
    })
    .from(dishIngredients)
    .innerJoin(dishes, eq(dishes.id, dishIngredients.dishId))
    .innerJoin(products, eq(products.id, dishIngredients.productId))
    .where(filter)
    .orderBy(asc(dishIngredients.position));
  return { dishes: rows, ingredients };
}

export async function findDish(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(dishes).where(owned(householdId, id));
  return row;
}

/** Блокує страву до кінця транзакції, щоб паралельні зміни складу йшли по черзі. */
export async function lockDish(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(dishes).where(owned(householdId, id)).for('update');
  return row;
}

export async function insertDish(db: DbOrTx, householdId: string, name: string) {
  const [row] = await db
    .insert(dishes)
    .values({ householdId, name, nameKey: productNameKey(name) })
    .returning();
  return row!;
}

export async function updateDish(
  db: DbOrTx,
  householdId: string,
  id: string,
  patch: { name?: string | undefined },
) {
  const [row] = await db
    .update(dishes)
    .set({
      ...(patch.name !== undefined && { name: patch.name, nameKey: productNameKey(patch.name) }),
      updatedAt: new Date(),
    })
    .where(owned(householdId, id))
    .returning();
  return row;
}

/**
 * Замінює склад страви цілком; позиції — у порядку переданих рядків. Страву вже перевірено на
 * належність домогосподарству, тож тут фільтр лише за її id. Викликається в транзакції.
 */
export async function replaceIngredients(
  db: DbOrTx,
  dishId: string,
  lines: readonly DishIngredientInput[],
) {
  await db.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId));
  if (lines.length === 0) return;
  await db.insert(dishIngredients).values(
    lines.map((line, position) => ({
      dishId,
      productId: line.productId,
      quantityMilli: line.quantityMilli,
      position,
    })),
  );
}

export async function deleteDish(db: DbOrTx, householdId: string, id: string) {
  const rows = await db.delete(dishes).where(owned(householdId, id)).returning({ id: dishes.id });
  return rows.length > 0;
}

/** Продукти з переданих id, що належать домогосподарству (зокрема архівні). */
export function findProductsByIds(db: DbOrTx, householdId: string, ids: readonly string[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.householdId, householdId), inArray(products.id, [...ids])));
}
