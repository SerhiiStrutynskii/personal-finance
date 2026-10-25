import type { DishSummary } from '@hf/shared';
import { and, asc, eq, getTableColumns, gte, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { dishes, mealTypes, menuEntries } from '../../db/schema.ts';
import { toSummaries } from './dishes.pricing.ts';
import { listWithIngredients } from './dishes.repo.ts';

export type MenuEntryRow = typeof menuEntries.$inferSelect;
/** Запис меню з назвою страви й позицією прийому їжі (для порядку). */
export interface MenuEntryWithNames extends MenuEntryRow {
  dishName: string;
  mealTypePosition: number;
}

const owned = (householdId: string, id: string) =>
  and(eq(menuEntries.householdId, householdId), eq(menuEntries.id, id));

function selectWithNames(db: DbOrTx) {
  return (
    db
      .select({
        ...getTableColumns(menuEntries),
        dishName: dishes.name,
        mealTypePosition: mealTypes.position,
      })
      .from(menuEntries)
      // Умова за домогосподарством і в join — захист у глибину: FK не гарантує, що страва й прийом
      // їжі того самого домогосподарства (це перевіряє сервіс під час додавання).
      .innerJoin(
        dishes,
        and(eq(dishes.id, menuEntries.dishId), eq(dishes.householdId, menuEntries.householdId)),
      )
      .innerJoin(
        mealTypes,
        and(
          eq(mealTypes.id, menuEntries.mealTypeId),
          eq(mealTypes.householdId, menuEntries.householdId),
        ),
      )
  );
}

/**
 * Записи періоду [from, to). Порядок за датою й позицією прийому їжі; у межах прийому їжі
 * страви за українським алфавітом розставляє сервіс.
 */
export function listEntries(
  db: DbOrTx,
  householdId: string,
  from: string,
  to: string,
): Promise<MenuEntryWithNames[]> {
  return selectWithNames(db)
    .where(
      and(
        eq(menuEntries.householdId, householdId),
        gte(menuEntries.date, from),
        lt(menuEntries.date, to),
      ),
    )
    .orderBy(asc(menuEntries.date), asc(mealTypes.position), asc(mealTypes.id));
}

export async function findEntry(
  db: DbOrTx,
  householdId: string,
  id: string,
): Promise<MenuEntryWithNames | undefined> {
  const [row] = await selectWithNames(db).where(owned(householdId, id));
  return row;
}

/**
 * Додає страву в прийом їжі дня. Якщо вона там уже є, порції додаються до наявних (атомарно,
 * через унікальний ключ). Сума понад 99 порушує check-обмеження, і запис не змінюється.
 */
export async function insertOrAddServings(
  db: DbOrTx,
  householdId: string,
  values: { date: string; mealTypeId: string; dishId: string; servings: number },
): Promise<{ row: MenuEntryRow; created: boolean }> {
  const [result] = await db
    .insert(menuEntries)
    .values({ householdId, ...values })
    .onConflictDoUpdate({
      target: [
        menuEntries.householdId,
        menuEntries.date,
        menuEntries.mealTypeId,
        menuEntries.dishId,
      ],
      set: {
        servings: sql`${menuEntries.servings} + excluded.servings`,
        updatedAt: new Date(),
      },
    })
    // xmax = 0 лише в щойно вставленого рядка, а не в оновленого.
    .returning({ ...getTableColumns(menuEntries), created: sql<boolean>`(xmax = 0)` });
  const { created, ...row } = result!;
  return { row, created };
}

export async function updateServings(
  db: DbOrTx,
  householdId: string,
  id: string,
  servings: number,
) {
  const [row] = await db
    .update(menuEntries)
    .set({ servings, updatedAt: new Date() })
    .where(owned(householdId, id))
    .returning();
  return row;
}

export async function deleteEntry(db: DbOrTx, householdId: string, id: string) {
  const rows = await db
    .delete(menuEntries)
    .where(owned(householdId, id))
    .returning({ id: menuEntries.id });
  return rows.length > 0;
}

/** Поточні ціни порцій страв домогосподарства з переданого набору, за id страви. */
export async function listDishPrices(
  db: DbOrTx,
  householdId: string,
  dishIds: readonly string[],
): Promise<Map<string, DishSummary>> {
  const ids = [...new Set(dishIds)];
  const { dishes: rows, ingredients } = await listWithIngredients(db, householdId, ids);
  return new Map(toSummaries(rows, ingredients).map((dish) => [dish.id, dish]));
}
