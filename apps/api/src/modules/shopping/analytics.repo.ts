import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { products, shoppingListItems, shoppingLists } from '../../db/schema.ts';

const items = shoppingListItems;

/** Куплені рядки списків домогосподарства з моментом покупки в [start, end). */
export function purchasesBetween(
  db: DbOrTx,
  householdId: string,
  period: { start: Date; end: Date },
) {
  return db
    .select({
      productId: items.productId,
      name: products.name,
      unit: products.unit,
      quantityMilli: items.quantityMilli,
      expectedUnitPrice: items.expectedUnitPriceMinor,
      actualUnitPrice: items.actualUnitPriceMinor,
      boughtAt: items.boughtAt,
    })
    .from(items)
    .innerJoin(shoppingLists, eq(shoppingLists.id, items.listId))
    .innerJoin(products, eq(products.id, items.productId))
    .where(
      and(
        eq(shoppingLists.householdId, householdId),
        eq(items.isBought, true),
        gte(items.boughtAt, period.start),
        lt(items.boughtAt, period.end),
      ),
    );
}

/** Ціна останньої покупки кожного з продуктів до моменту `before`. */
export async function lastPricesBefore(
  db: DbOrTx,
  householdId: string,
  productIds: string[],
  before: Date,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([items.productId], {
      productId: items.productId,
      price: items.actualUnitPriceMinor,
    })
    .from(items)
    .innerJoin(shoppingLists, eq(shoppingLists.id, items.listId))
    .where(
      and(
        eq(shoppingLists.householdId, householdId),
        inArray(items.productId, productIds),
        eq(items.isBought, true),
        isNotNull(items.actualUnitPriceMinor),
        lt(items.boughtAt, before),
      ),
    )
    .orderBy(items.productId, desc(items.boughtAt));
  return new Map(rows.map((row) => [row.productId, row.price!]));
}

/** Покупки продукту з фактичною ціною від найдавнішої. */
export function priceHistory(db: DbOrTx, householdId: string, productId: string) {
  return db
    .select({
      boughtAt: items.boughtAt,
      unitPrice: items.actualUnitPriceMinor,
      quantityMilli: items.quantityMilli,
      listId: shoppingLists.id,
      listName: shoppingLists.name,
    })
    .from(items)
    .innerJoin(shoppingLists, eq(shoppingLists.id, items.listId))
    .where(
      and(
        eq(shoppingLists.householdId, householdId),
        eq(items.productId, productId),
        eq(items.isBought, true),
        isNotNull(items.actualUnitPriceMinor),
      ),
    )
    .orderBy(asc(items.boughtAt), asc(items.id));
}
