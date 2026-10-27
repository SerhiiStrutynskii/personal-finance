import {
  type CreateMealTypeInput,
  type MealType,
  type ReorderMealTypesInput,
  type UpdateMealTypeInput,
} from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../http/errors.ts';
import * as repo from './mealTypes.repo.ts';

// Довідник ведуть усі учасники домогосподарства, як продукти й списки покупок.

const toDto = (row: repo.MealTypeRow): MealType => ({
  id: row.id,
  name: row.name,
  position: row.position,
});

/** Назва унікальна без урахування регістру й пробілів по краях. */
function rethrowDuplicate(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('Прийом їжі з такою назвою вже існує');
  throw error;
}

export async function listMealTypes(db: Db, auth: AuthContext): Promise<MealType[]> {
  return (await repo.listMealTypes(db, auth.householdId)).map(toDto);
}

/**
 * Без afterId новий прийом стає в кінець. З afterId — одразу після нього: в одній транзакції
 * вставляємо запис і переписуємо позиції всіх прийомів 0..n-1 (до afterId включно → новий →
 * решта). Чужий чи неіснуючий afterId — 404, нічого не створюється.
 */
export async function createMealType(
  db: Db,
  auth: AuthContext,
  input: CreateMealTypeInput,
): Promise<MealType> {
  const { afterId } = input;
  try {
    if (afterId === undefined) {
      const position = await repo.nextMealTypePosition(db, auth.householdId);
      return toDto(await repo.insertMealType(db, auth.householdId, input.name, position));
    }
    return await db.transaction(async (tx) => {
      const rows = await repo.listMealTypes(tx, auth.householdId, true);
      const index = rows.findIndex((row) => row.id === afterId);
      if (index === -1) throw notFound('Прийом їжі');
      const created = await repo.insertMealType(tx, auth.householdId, input.name, index + 1);
      const ids = rows.map((row) => row.id);
      ids.splice(index + 1, 0, created.id);
      await repo.reorderMealTypes(tx, auth.householdId, ids);
      return toDto({ ...created, position: index + 1 });
    });
  } catch (error) {
    rethrowDuplicate(error);
  }
}

export async function renameMealType(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateMealTypeInput,
): Promise<MealType> {
  let row: repo.MealTypeRow | undefined;
  try {
    row = await repo.renameMealType(db, auth.householdId, id, input.name);
  } catch (error) {
    rethrowDuplicate(error);
  }
  if (!row) throw notFound('Прийом їжі');
  return toDto(row);
}

/**
 * Новий порядок: ids мають збігатися з усіма прийомами їжі домогосподарства, інакше 400 і
 * порядок не змінюється. Позиції стають 0..n-1.
 */
export async function reorderMealTypes(
  db: Db,
  auth: AuthContext,
  input: ReorderMealTypesInput,
): Promise<MealType[]> {
  return db.transaction(async (tx) => {
    const rows = await repo.listMealTypes(tx, auth.householdId, true);
    const known = new Set(rows.map((row) => row.id));
    if (rows.length !== input.ids.length || !input.ids.every((id) => known.has(id))) {
      throw badRequest('Потрібно передати всі прийоми їжі, кожен один раз');
    }
    await repo.reorderMealTypes(tx, auth.householdId, input.ids);
    return (await repo.listMealTypes(tx, auth.householdId)).map(toDto);
  });
}

/**
 * Видалення остаточне; позиції решти не перераховуються. Прийом їжі, у якому є страви календаря
 * меню, видалити не можна (409). Позиції шаблонів дня в цьому прийомі їжі зникають (cascade).
 */
export async function deleteMealType(db: Db, auth: AuthContext, id: string): Promise<void> {
  let deleted: boolean;
  try {
    deleted = await repo.deleteMealType(db, auth.householdId, id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Прийом їжі використовується в меню. Приберіть його страви з календаря, щоб видалити',
      );
    }
    throw error;
  }
  if (!deleted) throw notFound('Прийом їжі');
}
