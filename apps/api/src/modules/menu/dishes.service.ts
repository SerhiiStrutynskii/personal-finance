import {
  compareProductNames,
  type CreateDishInput,
  type Dish,
  type DishIngredientInput,
  type DishSummary,
  type UpdateDishInput,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { conflict, isForeignKeyViolation, isUniqueViolation, notFound } from '../../http/errors.ts';
import { toIngredientDto, toSummaries, toSummary } from './dishes.pricing.ts';
import * as repo from './dishes.repo.ts';

// Страви ведуть усі учасники домогосподарства. Ціна порції рахується при кожному читанні
// з поточних цін продуктів і ніде не зберігається.

function toDish(row: repo.DishRow, ingredients: repo.IngredientWithProduct[]): Dish {
  const lines = ingredients.map(toIngredientDto);
  return { ...toSummary(row, lines), ingredients: lines };
}

function rethrowDuplicate(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('Страва з такою назвою вже існує');
  throw error;
}

async function loadDish(db: DbOrTx, auth: AuthContext, id: string): Promise<Dish> {
  const { dishes, ingredients } = await repo.listWithIngredients(db, auth.householdId, id);
  const row = dishes[0];
  if (!row) throw notFound('Страва');
  return toDish(row, ingredients);
}

/** Чужий чи неіснуючий продукт у складі — 404. Архівний продукт свого домогосподарства дозволений. */
async function assertOwnProducts(
  db: DbOrTx,
  auth: AuthContext,
  lines: readonly DishIngredientInput[],
) {
  const ids = [...new Set(lines.map((line) => line.productId))];
  const found = await repo.findProductsByIds(db, auth.householdId, ids);
  if (found.length !== ids.length) throw notFound('Продукт');
}

/** Страви за українським алфавітом, з ціною порції. */
export async function listDishes(db: Db, auth: AuthContext): Promise<DishSummary[]> {
  const { dishes, ingredients } = await repo.listWithIngredients(db, auth.householdId);
  return toSummaries(dishes, ingredients).sort((a, b) => compareProductNames(a.name, b.name));
}

export async function getDish(db: Db, auth: AuthContext, id: string): Promise<Dish> {
  return loadDish(db, auth, id);
}

export async function createDish(db: Db, auth: AuthContext, input: CreateDishInput): Promise<Dish> {
  try {
    return await db.transaction(async (tx) => {
      await assertOwnProducts(tx, auth, input.ingredients);
      const row = await repo.insertDish(tx, auth.householdId, input.name);
      await repo.replaceIngredients(tx, row.id, input.ingredients);
      return loadDish(tx, auth, row.id);
    });
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/** Змінює назву й/або склад; склад замінюється цілком. Усе — в одній транзакції. */
export async function updateDish(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateDishInput,
): Promise<Dish> {
  try {
    return await db.transaction(async (tx) => {
      if (!(await repo.lockDish(tx, auth.householdId, id))) throw notFound('Страва');
      if (input.ingredients) {
        await assertOwnProducts(tx, auth, input.ingredients);
        await repo.replaceIngredients(tx, id, input.ingredients);
      }
      await repo.updateDish(tx, auth.householdId, id, { name: input.name });
      return loadDish(tx, auth, id);
    });
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/**
 * Видаляє страву разом зі складом; продукти довідника лишаються. Страву, що є в календарі меню,
 * видалити не можна (409): спершу її прибирають з усіх днів.
 */
export async function deleteDish(db: Db, auth: AuthContext, id: string): Promise<void> {
  let deleted: boolean;
  try {
    deleted = await repo.deleteDish(db, auth.householdId, id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict('Страва є в меню. Приберіть її з календаря, щоб видалити');
    }
    throw error;
  }
  if (!deleted) throw notFound('Страва');
}
