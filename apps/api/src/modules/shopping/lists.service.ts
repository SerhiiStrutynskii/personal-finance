import {
  MAX_QUANTITY_MILLI,
  lineTotal,
  shoppingTotals,
  type AddShoppingListItemInput,
  type CreateShoppingListInput,
  type ShoppingList,
  type ShoppingListItem,
  type ShoppingListSummary,
  type UpdateShoppingListInput,
  type UpdateShoppingListItemInput,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../http/errors.ts';
import * as lists from './lists.repo.ts';
import * as products from './repo.ts';
import { rethrowDuplicate } from './service.ts';

const toItemDto = (row: lists.ItemWithProduct): ShoppingListItem => ({
  id: row.id,
  productId: row.productId,
  name: row.name,
  unit: row.unit,
  quantityMilli: row.quantityMilli,
  expectedUnitPrice: row.expectedUnitPriceMinor,
  actualUnitPrice: row.actualUnitPriceMinor,
  expectedTotal:
    row.expectedUnitPriceMinor === null
      ? null
      : lineTotal(row.quantityMilli, row.expectedUnitPriceMinor),
  actualTotal:
    row.actualUnitPriceMinor === null
      ? null
      : lineTotal(row.quantityMilli, row.actualUnitPriceMinor),
  isBought: row.isBought,
  boughtAt: row.boughtAt?.toISOString() ?? null,
});

function toSummary(row: lists.ShoppingListRow, items: ShoppingListItem[]): ShoppingListSummary {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    totals: shoppingTotals(items),
    createdAt: row.createdAt.toISOString(),
  };
}

function toList(row: lists.ShoppingListRow, rows: lists.ItemWithProduct[]): ShoppingList {
  const items = rows.map(toItemDto);
  // Куплене опускається вниз, решта — в порядку додавання (repo віддає за position).
  const ordered = [...items.filter((i) => !i.isBought), ...items.filter((i) => i.isBought)];
  return { ...toSummary(row, items), items: ordered };
}

async function requireList(db: DbOrTx, auth: AuthContext, id: string, lock = false) {
  const row = lock
    ? await lists.lockList(db, auth.householdId, id)
    : await lists.findList(db, auth.householdId, id);
  if (!row) throw notFound('Список покупок');
  return row;
}

async function loadList(db: DbOrTx, row: lists.ShoppingListRow): Promise<ShoppingList> {
  return toList(row, await lists.listItems(db, [row.id]));
}

/** Списки від найновішого, з підсумками. */
export async function listLists(db: Db, auth: AuthContext): Promise<ShoppingListSummary[]> {
  const rows = await lists.listLists(db, auth.householdId);
  const items = await lists.listItems(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) =>
    toSummary(row, items.filter((item) => item.listId === row.id).map(toItemDto)),
  );
}

export async function getList(db: Db, auth: AuthContext, id: string): Promise<ShoppingList> {
  return loadList(db, await requireList(db, auth, id));
}

export async function createList(
  db: Db,
  auth: AuthContext,
  input: CreateShoppingListInput,
): Promise<ShoppingList> {
  const row = await lists.insertList(db, auth.householdId, {
    name: input.name,
    createdBy: auth.userId,
  });
  return toList(row, []);
}

export async function renameList(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateShoppingListInput,
): Promise<ShoppingList> {
  const row = await lists.renameList(db, auth.householdId, id, input.name);
  if (!row) throw notFound('Список покупок');
  return loadList(db, row);
}

export async function deleteList(db: Db, auth: AuthContext, id: string): Promise<void> {
  if (!(await lists.deleteList(db, auth.householdId, id))) throw notFound('Список покупок');
}

/**
 * Продукт для нового рядка: наявний за id чи назвою або новий у довіднику. Архівний продукт,
 * який знову додають у список, повертається в довідник.
 */
async function resolveProduct(db: DbOrTx, auth: AuthContext, input: AddShoppingListItemInput) {
  let product =
    'productId' in input
      ? await products.findProduct(db, auth.householdId, input.productId)
      : await products.findProductByName(db, auth.householdId, input.name);
  if ('productId' in input && !product) throw notFound('Продукт');

  if (!product && 'name' in input) {
    try {
      product = await products.insertProduct(db, auth.householdId, input);
    } catch (error) {
      rethrowDuplicate(error);
    }
  }
  if (product!.isArchived) {
    product = await products.updateProduct(db, auth.householdId, product!.id, {
      isArchived: false,
    });
  }
  return product!;
}

/**
 * Додає продукт у список з очікуваною ціною з довідника. Продукт, що вже є в списку, не
 * дублюється: кількість додається до наявного рядка, і якщо його вже купили, позначка знімається.
 */
export async function addItem(
  db: Db,
  auth: AuthContext,
  listId: string,
  input: AddShoppingListItemInput,
): Promise<ShoppingList> {
  try {
    return await db.transaction(async (tx) => {
      const list = await requireList(tx, auth, listId, true);
      const product = await resolveProduct(tx, auth, input);
      const existing = await lists.findItemByProduct(tx, listId, product.id);

      if (existing) {
        const quantityMilli = existing.quantityMilli + input.quantityMilli;
        if (quantityMilli > MAX_QUANTITY_MILLI) throw badRequest('Кількість завелика');
        await lists.updateItem(tx, listId, existing.id, {
          quantityMilli,
          isBought: false,
          boughtAt: null,
        });
      } else {
        await lists.insertItem(tx, {
          listId,
          productId: product.id,
          quantityMilli: input.quantityMilli,
          expectedUnitPriceMinor: product.priceMinor,
          position: await lists.nextPosition(tx, listId),
        });
      }
      return loadList(tx, list);
    });
  } catch (error) {
    // Паралельне створення продукту з тією ж назвою.
    if (isUniqueViolation(error)) throw conflict('Продукт з такою назвою вже існує');
    throw error;
  }
}

/**
 * Змінює рядок. Позначка «куплено» фіксує момент покупки й, якщо фактичної ціни немає,
 * бере очікувану. Фактична ціна купленого рядка стає новою ціною продукту в довіднику.
 * Зняття позначки не повертає довіднику попередню ціну.
 */
export async function updateItem(
  db: Db,
  auth: AuthContext,
  listId: string,
  itemId: string,
  input: UpdateShoppingListItemInput,
  now: Date,
): Promise<ShoppingList> {
  return db.transaction(async (tx) => {
    const list = await requireList(tx, auth, listId, true);
    const item = await lists.findItem(tx, listId, itemId);
    if (!item) throw notFound('Рядок списку');

    const expected =
      input.expectedUnitPrice !== undefined ? input.expectedUnitPrice : item.expectedUnitPriceMinor;
    let actual =
      input.actualUnitPrice !== undefined ? input.actualUnitPrice : item.actualUnitPriceMinor;
    const isBought = input.isBought ?? item.isBought;
    const becameBought = isBought && !item.isBought;
    if (becameBought && actual === null) actual = expected;

    await lists.updateItem(tx, listId, itemId, {
      ...(input.quantityMilli !== undefined && { quantityMilli: input.quantityMilli }),
      expectedUnitPriceMinor: expected,
      actualUnitPriceMinor: actual,
      isBought,
      boughtAt: isBought ? (item.isBought ? item.boughtAt : now) : null,
    });

    const priceChanged = actual !== item.actualUnitPriceMinor;
    if (isBought && actual !== null && (becameBought || priceChanged)) {
      await products.updateProduct(tx, auth.householdId, item.productId, { price: actual });
    }
    return loadList(tx, list);
  });
}

export async function deleteItem(
  db: Db,
  auth: AuthContext,
  listId: string,
  itemId: string,
): Promise<ShoppingList> {
  return db.transaction(async (tx) => {
    const list = await requireList(tx, auth, listId, true);
    if (!(await lists.deleteItem(tx, listId, itemId))) throw notFound('Рядок списку');
    return loadList(tx, list);
  });
}
