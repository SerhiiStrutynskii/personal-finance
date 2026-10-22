import {
  DEFAULT_CURRENCY,
  budgetPeriod,
  localMonthKey,
  monthsEndingAt,
  shiftMonth,
  summarizePeriod,
  summarizePurchases,
  type ProductPriceHistory,
  type Purchase,
  type ShoppingAnalytics,
  type ShoppingPeriod,
  type TrendLength,
} from '@hf/shared';
import type { Db } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { badRequest, notFound } from '../../http/errors.ts';
import { findHouseholdTimeZone } from '../budgets/repo.ts';
import * as repo from './analytics.repo.ts';
import { getProduct } from './service.ts';

const toPurchases = (rows: Awaited<ReturnType<typeof repo.purchasesBetween>>): Purchase[] =>
  rows.map((row) => ({ ...row, boughtAt: row.boughtAt!.toISOString() }));

/** Часовий пояс і запитаний місяць; майбутній місяць не аналізується. */
async function resolveMonth(db: Db, auth: AuthContext, month: string | undefined, now: Date) {
  const timeZone = await findHouseholdTimeZone(db, auth.householdId);
  if (!timeZone) throw notFound('Домогосподарство');
  const currentMonth = localMonthKey(now, timeZone);
  const resolved = month ?? currentMonth;
  if (resolved > currentMonth) throw badRequest('Аналітика майбутніх місяців недоступна');
  return { timeZone, resolved };
}

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
  const { timeZone, resolved } = await resolveMonth(db, auth, month, now);

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

/** Покупки за `length` місяців, що закінчуються місяцем `month`: таблиця й графіки. */
export async function getShoppingPeriod(
  db: Db,
  auth: AuthContext,
  month: string | undefined,
  length: TrendLength,
  now: Date,
): Promise<ShoppingPeriod> {
  const { timeZone, resolved } = await resolveMonth(db, auth, month, now);
  const months = monthsEndingAt(resolved, length);
  const rows = await repo.purchasesBetween(db, auth.householdId, {
    start: budgetPeriod(months[0]!, timeZone).start,
    end: budgetPeriod(resolved, timeZone).end,
  });
  const purchases = toPurchases(rows).map((purchase) => ({
    ...purchase,
    month: localMonthKey(new Date(purchase.boughtAt), timeZone),
  }));
  return {
    month: resolved,
    currency: DEFAULT_CURRENCY,
    ...summarizePeriod(purchases, months),
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
