import {
  compareProductNames,
  type CreateProductInput,
  type Product,
  type UpdateProductInput,
} from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { conflict, isForeignKeyViolation, isUniqueViolation, notFound } from '../../http/errors.ts';
import * as repo from './repo.ts';

export const toDto = (row: repo.ProductRow): Product => ({
  id: row.id,
  name: row.name,
  unit: row.unit,
  price: row.priceMinor,
  currency: row.currency,
  isArchived: row.isArchived,
  createdAt: row.createdAt.toISOString(),
});

/** Назва унікальна без урахування регістру: «Молоко» і «молоко» — той самий продукт. */
export function rethrowDuplicate(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('Продукт з такою назвою вже існує');
  throw error;
}

export async function listProducts(
  db: Db,
  auth: AuthContext,
  withArchived: boolean,
): Promise<Product[]> {
  const rows = await repo.listProducts(db, auth.householdId, withArchived);
  return rows.map(toDto).sort((a, b) => compareProductNames(a.name, b.name));
}

export async function getProduct(db: Db, auth: AuthContext, id: string): Promise<Product> {
  const row = await repo.findProduct(db, auth.householdId, id);
  if (!row) throw notFound('Продукт');
  return toDto(row);
}

export async function createProduct(
  db: Db,
  auth: AuthContext,
  input: CreateProductInput,
): Promise<Product> {
  try {
    return toDto(await repo.insertProduct(db, auth.householdId, input));
  } catch (error) {
    rethrowDuplicate(error);
  }
}

export async function updateProduct(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  let row: repo.ProductRow | undefined;
  try {
    row = await repo.updateProduct(db, auth.householdId, id, input);
  } catch (error) {
    rethrowDuplicate(error);
  }
  if (!row) throw notFound('Продукт');
  return toDto(row);
}

/**
 * Продукт, який уже є в списках покупок або в складі страв, не видаляється: історія цін і склад
 * страв лишаються цілими.
 */
export async function deleteProduct(db: Db, auth: AuthContext, id: string): Promise<void> {
  let deleted: boolean;
  try {
    deleted = await repo.deleteProduct(db, auth.householdId, id);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw conflict(
        'Продукт використовується в списках покупок або стравах. Заархівуйте його, щоб приховати з довідника',
      );
    }
    throw error;
  }
  if (!deleted) throw notFound('Продукт');
}
