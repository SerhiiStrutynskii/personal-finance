import type { DishSummary, ProductUnit } from '@hf/shared';
import { and, asc, eq, getTableColumns, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { dishes, mealTypes, menuEntries, products } from '../../db/schema.ts';
import { toSummaries } from './dishes.pricing.ts';
import { listWithIngredients } from './dishes.repo.ts';

export type MenuEntryRow = typeof menuEntries.$inferSelect;

interface MenuEntryCommon {
  id: string;
  date: string;
  mealTypeId: string;
  /** Поточна назва страви чи продукту з довідника. */
  name: string;
  mealTypePosition: number;
}
export interface MenuDishEntryRow extends MenuEntryCommon {
  kind: 'dish';
  dishId: string;
  servings: number;
}
export interface MenuProductEntryRow extends MenuEntryCommon {
  kind: 'product';
  productId: string;
  quantityMilli: number;
  unit: ProductUnit;
  /** Поточна ціна продукту за одиницю; null — невідома. */
  priceMinor: number | null;
  isArchived: boolean;
}
/** Запис меню з назвою страви чи продукту й позицією прийому їжі (для порядку). */
export type MenuEntryWithNames = MenuDishEntryRow | MenuProductEntryRow;

const owned = (householdId: string, id: string) =>
  and(eq(menuEntries.householdId, householdId), eq(menuEntries.id, id));

function selectWithNames(db: DbOrTx) {
  return (
    db
      .select({
        id: menuEntries.id,
        date: menuEntries.date,
        mealTypeId: menuEntries.mealTypeId,
        dishId: menuEntries.dishId,
        servings: menuEntries.servings,
        productId: menuEntries.productId,
        quantityMilli: menuEntries.quantityMilli,
        dishName: dishes.name,
        productName: products.name,
        unit: products.unit,
        priceMinor: products.priceMinor,
        isArchived: products.isArchived,
        mealTypePosition: mealTypes.position,
      })
      .from(menuEntries)
      // Умова за домогосподарством і в join — захист у глибину: FK не гарантує, що страва, продукт
      // і прийом їжі того самого домогосподарства (це перевіряє сервіс під час додавання).
      .leftJoin(
        dishes,
        and(eq(dishes.id, menuEntries.dishId), eq(dishes.householdId, menuEntries.householdId)),
      )
      .leftJoin(
        products,
        and(
          eq(products.id, menuEntries.productId),
          eq(products.householdId, menuEntries.householdId),
        ),
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

type RawEntry = Awaited<ReturnType<typeof selectWithNames>>[number];

/** Рядок запиту → запис свого виду; запис, страва чи продукт якого не знайшлися, відкидається. */
function toEntry(raw: RawEntry): MenuEntryWithNames | undefined {
  const common = {
    id: raw.id,
    date: raw.date,
    mealTypeId: raw.mealTypeId,
    mealTypePosition: raw.mealTypePosition,
  };
  if (raw.dishId !== null && raw.servings !== null && raw.dishName !== null) {
    return {
      ...common,
      kind: 'dish',
      name: raw.dishName,
      dishId: raw.dishId,
      servings: raw.servings,
    };
  }
  if (
    raw.productId !== null &&
    raw.quantityMilli !== null &&
    raw.productName !== null &&
    raw.unit !== null &&
    raw.isArchived !== null
  ) {
    return {
      ...common,
      kind: 'product',
      name: raw.productName,
      productId: raw.productId,
      quantityMilli: raw.quantityMilli,
      unit: raw.unit,
      priceMinor: raw.priceMinor,
      isArchived: raw.isArchived,
    };
  }
  return undefined;
}

const toEntries = (rows: readonly RawEntry[]) =>
  rows.map(toEntry).filter((row): row is MenuEntryWithNames => row !== undefined);

/**
 * Записи періоду [from, to). Порядок за датою й позицією прийому їжі; у межах прийому їжі
 * страви й продукти за українським алфавітом розставляє сервіс.
 */
export async function listEntries(
  db: DbOrTx,
  householdId: string,
  from: string,
  to: string,
): Promise<MenuEntryWithNames[]> {
  const rows = await selectWithNames(db)
    .where(
      and(
        eq(menuEntries.householdId, householdId),
        gte(menuEntries.date, from),
        lt(menuEntries.date, to),
      ),
    )
    .orderBy(asc(menuEntries.date), asc(mealTypes.position), asc(mealTypes.id));
  return toEntries(rows);
}

export async function findEntry(
  db: DbOrTx,
  householdId: string,
  id: string,
): Promise<MenuEntryWithNames | undefined> {
  const [row] = toEntries(await selectWithNames(db).where(owned(householdId, id)));
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

/**
 * Додає продукт напряму в прийом їжі дня. Якщо він там уже є, кількість додається до наявної
 * (атомарно, через унікальний ключ menu_entries_product_unique). Сума понад 1 000 000 одиниць
 * порушує check-обмеження, і запис не змінюється.
 */
export async function insertOrAddQuantity(
  db: DbOrTx,
  householdId: string,
  values: { date: string; mealTypeId: string; productId: string; quantityMilli: number },
): Promise<{ row: MenuEntryRow; created: boolean }> {
  const [result] = await db
    .insert(menuEntries)
    .values({ householdId, ...values })
    .onConflictDoUpdate({
      target: [
        menuEntries.householdId,
        menuEntries.date,
        menuEntries.mealTypeId,
        menuEntries.productId,
      ],
      set: {
        quantityMilli: sql`${menuEntries.quantityMilli} + excluded.quantity_milli`,
        updatedAt: new Date(),
      },
    })
    .returning({ ...getTableColumns(menuEntries), created: sql<boolean>`(xmax = 0)` });
  const { created, ...row } = result!;
  return { row, created };
}

/** Порції змінюються лише в записі зі стравою. */
export async function updateServings(
  db: DbOrTx,
  householdId: string,
  id: string,
  servings: number,
) {
  const [row] = await db
    .update(menuEntries)
    .set({ servings, updatedAt: new Date() })
    .where(and(owned(householdId, id), isNotNull(menuEntries.dishId)))
    .returning();
  return row;
}

/** Кількість змінюється лише в записі з продуктом. */
export async function updateQuantity(
  db: DbOrTx,
  householdId: string,
  id: string,
  quantityMilli: number,
) {
  const [row] = await db
    .update(menuEntries)
    .set({ quantityMilli, updatedAt: new Date() })
    .where(and(owned(householdId, id), isNotNull(menuEntries.productId)))
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

/** Вміст запису без назв і цін: прийом їжі й страва з порціями або продукт з кількістю. */
export interface MenuEntryContent {
  mealTypeId: string;
  dishId: string | null;
  servings: number | null;
  productId: string | null;
  quantityMilli: number | null;
}

const dayOf = (householdId: string, date: string) =>
  and(eq(menuEntries.householdId, householdId), eq(menuEntries.date, date));

/** Сирі записи дня свого домогосподарства, без join на назви (для збереження шаблону). */
export function listDayEntryRows(
  db: DbOrTx,
  householdId: string,
  date: string,
): Promise<MenuEntryContent[]> {
  return db
    .select({
      mealTypeId: menuEntries.mealTypeId,
      dishId: menuEntries.dishId,
      servings: menuEntries.servings,
      productId: menuEntries.productId,
      quantityMilli: menuEntries.quantityMilli,
    })
    .from(menuEntries)
    .where(dayOf(householdId, date));
}

/** Прибирає всі записи дня; повертає їхню кількість. Викликається в транзакції. */
export async function deleteDayEntries(db: DbOrTx, householdId: string, date: string) {
  const rows = await db
    .delete(menuEntries)
    .where(dayOf(householdId, date))
    .returning({ id: menuEntries.id });
  return rows.length;
}

/** Нові записи дня з переданого вмісту. Викликається в транзакції. */
export async function insertEntries(
  db: DbOrTx,
  householdId: string,
  date: string,
  items: readonly MenuEntryContent[],
) {
  if (items.length === 0) return;
  await db.insert(menuEntries).values(items.map((item) => ({ ...item, householdId, date })));
}
