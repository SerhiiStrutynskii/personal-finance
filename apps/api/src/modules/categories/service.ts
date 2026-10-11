import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { conflict, isForeignKeyViolation, isUniqueViolation, notFound } from '../../http/errors.ts';
import * as repo from './repo.ts';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './schema.ts';

const toDto = (row: repo.CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
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

export async function createCategory(
  db: Db,
  auth: AuthContext,
  input: CreateCategoryInput,
): Promise<Category> {
  try {
    return toDto(await repo.insertCategory(db, auth.householdId, input));
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    throw error;
  }
}

export async function updateCategory(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  try {
    const row = await repo.updateCategory(db, auth.householdId, id, input);
    if (!row) throw notFound('Категорія');
    return toDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicate();
    throw error;
  }
}

export async function deleteCategory(db: Db, auth: AuthContext, id: string): Promise<void> {
  try {
    if (!(await repo.deleteCategory(db, auth.householdId, id))) throw notFound('Категорія');
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict('Категорія використовується в транзакціях, тому її не можна видалити');
    }
    throw error;
  }
}
