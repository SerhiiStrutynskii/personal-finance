import {
  DEFAULT_CURRENCY,
  budgetPeriod,
  localMonthKey,
  shiftMonth,
  summarizePurchases,
  type ProductPriceHistory,
  type Purchase,
  type ShoppingAnalytics,
} from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, notFound } from '../../http/errors.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import * as repo from './analytics.repo.ts';
import { getProduct } from './service.ts';

const toPurchases = (rows: Awaited<ReturnType<typeof repo.purchasesBetween>>): Purchase[] =>
  rows.map((row) => ({ ...row, boughtAt: row.boughtAt!.toISOString() }));

/**
 * Покупки за списками за місяць у часовому поясі домогосподарства. Окремо від витрат:
 * списки не створюють транзакцій, тож ці суми не додаються до аналітики витрат.
 */
export async function getShoppingAnalytics(
  db: Db,
  auth: AuthContext,
  month: string | undefined,
  now: Date,
): Promise<ShoppingAnalytics> {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  const currentMonth = localMonthKey(now, timeZone);
  const resolved = month ?? currentMonth;
  if (resolved > currentMonth) throw badRequest('Аналітика майбутніх місяців недоступна');

  const period = budgetPeriod(resolved, timeZone);
  const [current, previous] = await Promise.all([
    repo.purchasesBetween(db, auth.householdId, period),
    repo.purchasesBetween(db, auth.householdId, budgetPeriod(shiftMonth(resolved, -1), timeZone)),
  ]);
  const productIds = [...new Set(current.map((row) => row.productId))];
  const lastPrices = await repo.lastPricesBefore(db, auth.householdId, productIds, period.start);

  return {
    month: resolved,
    currency: DEFAULT_CURRENCY,
    ...summarizePurchases(toPurchases(current), toPurchases(previous), lastPrices),
  };
}

export async function getPriceHistory(
  db: Db,
  auth: AuthContext,
  productId: string,
): Promise<ProductPriceHistory> {
  const product = await getProduct(db, auth, productId);
  const rows = await repo.priceHistory(db, auth.householdId, productId);
  return {
    product,
    points: rows.map((row) => ({
      ...row,
      boughtAt: row.boughtAt!.toISOString(),
      unitPrice: row.unitPrice!,
    })),
  };
}
