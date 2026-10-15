import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  conflict,
  isForeignKeyViolation,
  isUniqueViolation,
  notFound,
} from '../../http/errors.ts';
import { hasLinesOnBoth } from '../budgets/repo.ts';
import * as repo from './repo.ts';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './schema.ts';

const toDto = (row: repo.CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  systemKey: row.systemKey,
  parentId: row.parentId,
  createdAt: row.createdAt.toISOString(),
});

const duplicate = () => conflict('Категорія з такою назвою вже існує');

export async function listCategories(db: Db, auth: AuthContext): Promise<Category[]> {
  return (await repo.listCategories(db, auth.householdId)).map(toDto);
}

export async function getCategory(db: Db, auth: AuthContext, id: string): Promise<Category> {
  const row = await repo.findCategory(db, auth.householdId, id);
  if (!row) throw notFound('Категорія');
  return toDto(row);
}

/**
 * Батьком може бути лише звичайна категорія верхнього рівня того самого типу: рівнів два,
 * а системні категорії застосунок веде сам.
 */
async function assertValidParent(db: Db, auth: AuthContext, parentId: string, kind: string) {
  const parent = await repo.findCategory(db, auth.householdId, parentId);
  if (!parent) throw badRequest('Батьківську категорію не знайдено');
  if (parent.kind !== kind) throw badRequest('Батьківська категорія має бути того самого типу');
  if (parent.parentId) throw badRequest('Підкатегорія не може мати власних підкатегорій');
  if (parent.systemKey) throw badRequest('Системна категорія не може мати підкатегорій');
}

export async function createCategory(
  db: Db,
  auth: AuthContext,
  input: CreateCategoryInput,
): Promise<Category> {
  if (input.parentId) await assertValidParent(db, auth, input.parentId, input.kind);
  try {
    return toDto(await repo.insertCategory(db, auth.householdId, input));
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    // Батька могли видалити між перевіркою і записом.
    if (isForeignKeyViolation(error)) throw badRequest('Батьківську категорію не знайдено');
    throw error;
  }
}

/** Системні категорії (погашення боргів, відсотки й комісії) не змінюються й не видаляються. */
async function existingEditable(db: Db, auth: AuthContext, id: string) {
  const row = await repo.findCategory(db, auth.householdId, id);
  if (!row) throw notFound('Категорія');
  if (row.systemKey) throw conflict('Системну категорію не можна змінити чи видалити');
  return row;
}

/**
 * Перенесення під іншу категорію. Історія не губиться: транзакції лишаються на тій самій
 * категорії. Заборонено, якщо в категорії є власні підкатегорії (вийшло б три рівні) або
 * якщо в якомусь бюджеті є ліміти і на новому батькові, і на цій категорії.
 */
async function assertCanMove(
  db: Db,
  auth: AuthContext,
  category: repo.CategoryRow,
  parentId: string,
) {
  if (parentId === category.id) throw badRequest('Категорія не може бути власною підкатегорією');
  await assertValidParent(db, auth, parentId, category.kind);
  if ((await repo.listChildren(db, auth.householdId, category.id)).length > 0) {
    throw conflict('Категорію з підкатегоріями не можна зробити підкатегорією');
  }
  if (await hasLinesOnBoth(db, auth.householdId, parentId, [category.id])) {
    throw conflict(
      'У бюджеті є ліміти і на цій категорії, і на новій батьківській — спершу приберіть один із них',
    );
  }
}

export async function updateCategory(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const existing = await existingEditable(db, auth, id);
  if (input.parentId) await assertCanMove(db, auth, existing, input.parentId);
  try {
    const row = await repo.updateCategory(db, auth.householdId, id, input);
    if (!row) throw notFound('Категорія');
    return toDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    if (isForeignKeyViolation(error)) throw badRequest('Батьківську категорію не знайдено');
    throw error;
  }
}

export async function deleteCategory(db: Db, auth: AuthContext, id: string): Promise<void> {
  await existingEditable(db, auth, id);
  if ((await repo.listChildren(db, auth.householdId, id)).length > 0) {
    throw conflict('Спершу видаліть або перенесіть підкатегорії цієї категорії');
  }
  try {
    if (!(await repo.deleteCategory(db, auth.householdId, id))) throw notFound('Категорія');
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Категорія використовується в транзакціях або бюджеті, тому її не можна видалити',
      );
    }
    throw error;
  }
}
