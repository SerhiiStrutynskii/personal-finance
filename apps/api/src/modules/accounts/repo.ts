import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { accounts, transactions } from '../../db/schema.ts';
import type { CreateAccountInput, UpdateAccountInput } from './schema.ts';

export type AccountRow = typeof accounts.$inferSelect;

const owned = (householdId: string, id: string) =>
  and(eq(accounts.householdId, householdId), eq(accounts.id, id));

export function listAccounts(db: DbOrTx, householdId: string): Promise<AccountRow[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.householdId, householdId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
}

export async function findAccount(db: DbOrTx, householdId: string, id: string) {
  const [row] = await db.select().from(accounts).where(owned(householdId, id));
  return row;
}

export function findAccountsByIds(db: DbOrTx, householdId: string, ids: string[]) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.householdId, householdId), inArray(accounts.id, ids)));
}

export async function insertAccount(db: DbOrTx, householdId: string, input: CreateAccountInput) {
  const [row] = await db
    .insert(accounts)
    .values({ ...input, householdId })
    .returning();
  return row!;
}

export async function updateAccount(
  db: DbOrTx,
  householdId: string,
  id: string,
  input: UpdateAccountInput,
) {
  const patch = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.type !== undefined && { type: input.type }),
  };
  const [row] = await db.update(accounts).set(patch).where(owned(householdId, id)).returning();
  return row;
}

export async function deleteAccount(db: DbOrTx, householdId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(accounts)
    .where(owned(householdId, id))
    .returning({ id: accounts.id });
  return rows.length > 0;
}

/**
 * Баланси рахунків домогосподарства з транзакцій одним запитом: доходи й вхідні перекази
 * додаються, витрати, платежі по боргах і вихідні перекази віднімаються, службова зміна
 * балансу додається зі своїм знаком. `before` обмежує рух моментами, ранішими за нього.
 */
export async function accountBalances(
  db: DbOrTx,
  householdId: string,
  options: { before?: Date | undefined } = {},
): Promise<Map<string, number>> {
  const period = options.before ? sql`AND occurred_at < ${options.before}` : sql``;
  const result = await db.execute<{ account_id: string; balance: string }>(sql`
    SELECT account_id, sum(delta) AS balance
    FROM (
      SELECT account_id,
             CASE WHEN type IN ('income', 'balance_adjustment') THEN amount_minor
                  ELSE -amount_minor END AS delta
      FROM ${transactions}
      WHERE household_id = ${householdId} ${period}
      UNION ALL
      SELECT to_account_id, amount_minor
      FROM ${transactions}
      WHERE household_id = ${householdId} AND to_account_id IS NOT NULL ${period}
    ) AS movements
    GROUP BY account_id
  `);
  return new Map(result.rows.map((row) => [row.account_id, Number(row.balance)]));
}
