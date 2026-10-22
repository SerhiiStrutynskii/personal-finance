import { productNameKey, type CreateProductInput, type UpdateProductInput } from '@hf/shared';
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { products } from '../../db/schema.ts';

export type ProductRow = typeof products.$inferSelect;

const owned = (householdId: string, id: string) =>
  and(eq(products.householdId, householdId), eq(products.id, id));

/** Без сортування: порядок за українським алфавітом задає сервіс. */
export function listProducts(db: DbOrTx, householdId: string): Promise<ProductRow[]> {
  return db.select().from(products).where(eq(products.householdId, householdId));
}

export async function findProduct(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(products).where(owned(householdId, id));
  return row;
}

export async function insertProduct(db: DbOrTx, householdId: string, input: CreateProductInput) {
  const [row] = await db
    .insert(products)
    .values({
      householdId,
      name: input.name,
      nameKey: productNameKey(input.name),
      unit: input.unit,
      priceMinor: input.price,
    })
    .returning();
  return row!;
}

export async function updateProduct(
  db: DbOrTx,
  householdId: string,
  id: string,
  input: UpdateProductInput,
) {
  const patch = {
    ...(input.name !== undefined && { name: input.name, nameKey: productNameKey(input.name) }),
    ...(input.unit !== undefined && { unit: input.unit }),
    ...(input.price !== undefined && { priceMinor: input.price }),
    updatedAt: new Date(),
  };
  const [row] = await db.update(products).set(patch).where(owned(householdId, id)).returning();
  return row;
}

export async function deleteProduct(db: DbOrTx, householdId: string, id: string) {
  const rows = await db
    .delete(products)
    .where(owned(householdId, id))
    .returning({ id: products.id });
  return rows.length > 0;
}
