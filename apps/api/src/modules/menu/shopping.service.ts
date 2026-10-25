import {
  DEFAULT_CURRENCY,
  MAX_QUANTITY_MILLI,
  menuShoppingItems,
  menuShoppingListName,
  menuShoppingTotal,
  type CreateMenuShoppingListInput,
  type MenuShopping,
  type MenuShoppingItem,
  type MenuShoppingQuery,
  type ShoppingList,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest } from '../../http/errors.ts';
import * as lists from '../shopping/lists.repo.ts';
import { loadList } from '../shopping/lists.service.ts';
import * as products from '../shopping/repo.ts';
import { listWithIngredients } from './dishes.repo.ts';
import { listEntries } from './entries.repo.ts';

// Покупки за меню ведуть усі учасники домогосподарства, як меню й списки покупок. Перелік і бюджет
// рахуються щоразу з меню, складу страв і поточних цін продуктів і ніде не зберігаються.

/** Перелік продуктів для записів меню періоду [from, to) домогосподарства. */
async function computeItems(
  db: DbOrTx,
  householdId: string,
  { from, to }: MenuShoppingQuery,
): Promise<{ entryCount: number; items: MenuShoppingItem[] }> {
  const entries = await listEntries(db, householdId, from, to);
  const { ingredients } = await listWithIngredients(db, householdId, [
    ...new Set(entries.map((entry) => entry.dishId)),
  ]);
  return { entryCount: entries.length, items: menuShoppingItems(entries, ingredients) };
}

/** Які продукти й скільки потрібно для меню періоду та орієнтовний бюджет на них. */
export async function getMenuShopping(
  db: Db,
  auth: AuthContext,
  query: MenuShoppingQuery,
): Promise<MenuShopping> {
  const { entryCount, items } = await computeItems(db, auth.householdId, query);
  return {
    from: query.from,
    to: query.to,
    currency: DEFAULT_CURRENCY,
    entryCount,
    items,
    total: menuShoppingTotal(items),
  };
}

/**
 * Створює звичайний список покупок із переліку продуктів меню. Очікувана ціна рядка — знімок
 * поточної ціни продукту; після створення список із меню не пов'язаний. Архівний продукт зі
 * складу страви повертається в довідник, як і при додаванні в список вручну.
 */
export async function createShoppingListFromMenu(
  db: Db,
  auth: AuthContext,
  input: CreateMenuShoppingListInput,
): Promise<ShoppingList> {
  return db.transaction(async (tx) => {
    const { items } = await computeItems(tx, auth.householdId, input);
    if (items.length === 0) throw badRequest('За цей період у меню немає продуктів');
    const tooMuch = items.find((item) => item.quantityMilli > MAX_QUANTITY_MILLI);
    if (tooMuch) {
      throw badRequest(`Кількість продукту «${tooMuch.name}» завелика для списку покупок`);
    }

    const list = await lists.insertList(tx, auth.householdId, {
      name: input.name ?? menuShoppingListName(input.from, input.to),
      createdBy: auth.userId,
    });
    for (const [position, item] of items.entries()) {
      if (item.isArchived) {
        await products.updateProduct(tx, auth.householdId, item.productId, { isArchived: false });
      }
      await lists.insertItem(tx, {
        listId: list.id,
        productId: item.productId,
        quantityMilli: item.quantityMilli,
        expectedUnitPriceMinor: item.unitPrice,
        position,
      });
    }
    return loadList(tx, list);
  });
}
