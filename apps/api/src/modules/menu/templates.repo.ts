import { productNameKey } from '@hf/shared';
import { and, count, eq, getTableColumns } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { menuDayTemplateItems, menuDayTemplates } from '../../db/schema.ts';
import type { MenuEntryContent } from './entries.repo.ts';

export type MenuDayTemplateRow = typeof menuDayTemplates.$inferSelect;
export type MenuDayTemplateWithCount = MenuDayTemplateRow & { itemCount: number };

const owned = (householdId: string, id: string) =>
  and(eq(menuDayTemplates.householdId, householdId), eq(menuDayTemplates.id, id));

function selectWithCount(db: DbOrTx) {
  return db
    .select({ ...getTableColumns(menuDayTemplates), itemCount: count(menuDayTemplateItems.id) })
    .from(menuDayTemplates)
    .leftJoin(menuDayTemplateItems, eq(menuDayTemplateItems.templateId, menuDayTemplates.id));
}

/** Шаблони домогосподарства з кількістю позицій; без сортування — порядок задає сервіс. */
export function listTemplates(
  db: DbOrTx,
  householdId: string,
): Promise<MenuDayTemplateWithCount[]> {
  return selectWithCount(db)
    .where(eq(menuDayTemplates.householdId, householdId))
    .groupBy(menuDayTemplates.id);
}

export async function findTemplate(
  db: DbOrTx,
  householdId: string,
  id: string,
): Promise<MenuDayTemplateWithCount | undefined> {
  const [row] = await selectWithCount(db)
    .where(owned(householdId, id))
    .groupBy(menuDayTemplates.id);
  return row;
}

/** Шаблон і його позиції. Викликається в транзакції. */
export async function insertTemplate(
  db: DbOrTx,
  householdId: string,
  { name, items }: { name: string; items: readonly MenuEntryContent[] },
): Promise<MenuDayTemplateWithCount> {
  const [row] = await db
    .insert(menuDayTemplates)
    .values({ householdId, name, nameKey: productNameKey(name) })
    .returning();
  if (items.length > 0) {
    await db
      .insert(menuDayTemplateItems)
      .values(items.map((item) => ({ ...item, templateId: row!.id })));
  }
  return { ...row!, itemCount: items.length };
}

export async function renameTemplate(db: DbOrTx, householdId: string, id: string, name: string) {
  const [row] = await db
    .update(menuDayTemplates)
    .set({ name, nameKey: productNameKey(name), updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning({ id: menuDayTemplates.id });
  return row !== undefined;
}

export async function deleteTemplate(db: DbOrTx, householdId: string, id: string) {
  const rows = await db
    .delete(menuDayTemplates)
    .where(owned(householdId, id))
    .returning({ id: menuDayTemplates.id });
  return rows.length > 0;
}

/** Позиції шаблону свого домогосподарства (через join на шаблон). */
export function listTemplateItems(
  db: DbOrTx,
  householdId: string,
  templateId: string,
): Promise<MenuEntryContent[]> {
  return db
    .select({
      mealTypeId: menuDayTemplateItems.mealTypeId,
      dishId: menuDayTemplateItems.dishId,
      servings: menuDayTemplateItems.servings,
      productId: menuDayTemplateItems.productId,
      quantityMilli: menuDayTemplateItems.quantityMilli,
    })
    .from(menuDayTemplateItems)
    .innerJoin(menuDayTemplates, eq(menuDayTemplates.id, menuDayTemplateItems.templateId))
    .where(owned(householdId, templateId));
}
