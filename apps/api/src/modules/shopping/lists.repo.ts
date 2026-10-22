import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { products, shoppingListItems, shoppingLists } from '../../db/schema.ts';

export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type ShoppingListItemRow = typeof shoppingListItems.$inferSelect;
/** Рядок разом із назвою й одиницею продукту. */
export type ItemWithProduct = ShoppingListItemRow & {
  name: string;
  unit: (typeof products.$inferSelect)['unit'];
};

const owned = (householdId: string, id: string) =>
  and(eq(shoppingLists.householdId, householdId), eq(shoppingLists.id, id));

export function listLists(db: DbOrTx, householdId: string): Promise<ShoppingListRow[]> {
  return db
    .select()
    .from(shoppingLists)
    .where(eq(shoppingLists.householdId, householdId))
    .orderBy(desc(shoppingLists.createdAt), desc(shoppingLists.id));
}

export async function findList(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(shoppingLists).where(owned(householdId, id));
  return row;
}

/** Блокує список до кінця транзакції, щоб паралельні зміни рядків ішли по черзі. */
export async function lockList(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(shoppingLists).where(owned(householdId, id)).for('update');
  return row;
}

export async function insertList(
  db: DbOrTx,
  householdId: string,
  values: { name: string; createdBy: string },
) {
  const [row] = await db
    .insert(shoppingLists)
    .values({ householdId, ...values })
    .returning();
  return row!;
}

export async function renameList(db: DbOrTx, householdId: string, id: string, name: string) {
  const [row] = await db
    .update(shoppingLists)
    .set({ name, updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteList(db: DbOrTx, householdId: string, id: string) {
  const rows = await db
    .delete(shoppingLists)
    .where(owned(householdId, id))
    .returning({ id: shoppingLists.id });
  return rows.length > 0;
}

/**
 * Рядки вказаних списків у порядку додавання. Списки вже перевірено на належність
 * домогосподарству, тож тут фільтр лише за їхніми id.
 */
export async function listItems(db: DbOrTx, listIds: string[]): Promise<ItemWithProduct[]> {
  if (listIds.length === 0) return [];
  const rows = await db
    .select({ item: shoppingListItems, name: products.name, unit: products.unit })
    .from(shoppingListItems)
    .innerJoin(products, eq(products.id, shoppingListItems.productId))
    .where(inArray(shoppingListItems.listId, listIds))
    .orderBy(asc(shoppingListItems.position));
  return rows.map(({ item, name, unit }) => ({ ...item, name, unit }));
}

export async function findItem(db: DbOrTx, listId: string, itemId: string) {
  const [row] = await db
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.id, itemId)));
  return row;
}

export async function findItemByProduct(db: DbOrTx, listId: string, productId: string) {
  const [row] = await db
    .select()
    .from(shoppingListItems)
    .where(and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.productId, productId)));
  return row;
}

export async function nextPosition(db: DbOrTx, listId: string): Promise<number> {
  const [row] = await db
    .select({ last: max(shoppingListItems.position) })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, listId));
  return (row?.last ?? -1) + 1;
}

export async function insertItem(
  db: DbOrTx,
  values: Pick<
    typeof shoppingListItems.$inferInsert,
    'listId' | 'productId' | 'quantityMilli' | 'expectedUnitPriceMinor' | 'position'
  >,
) {
  const [row] = await db.insert(shoppingListItems).values(values).returning();
  return row!;
}

export async function updateItem(
  db: DbOrTx,
  listId: string,
  itemId: string,
  patch: Partial<
    Pick<
      ShoppingListItemRow,
      'quantityMilli' | 'expectedUnitPriceMinor' | 'actualUnitPriceMinor' | 'isBought' | 'boughtAt'
    >
  >,
) {
  const [row] = await db
    .update(shoppingListItems)
    .set(patch)
    .where(and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.id, itemId)))
    .returning();
  return row;
}

export async function deleteItem(db: DbOrTx, listId: string, itemId: string) {
  const rows = await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.id, itemId)))
    .returning({ id: shoppingListItems.id });
  return rows.length > 0;
}
