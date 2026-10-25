import {
  DEFAULT_CURRENCY,
  compareProductNames,
  menuCostTotal,
  menuEntryCost,
  type CreateMenuEntryInput,
  type DishSummary,
  type MenuDay,
  type MenuEntry,
  type MenuPeriod,
  type MenuPeriodQuery,
  type UpdateMenuEntryInput,
} from '@hf/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import {
  badRequest,
  isCheckViolation,
  isForeignKeyViolation,
  notFound,
} from '../../http/errors.ts';
import { findMealType } from './mealTypes.repo.ts';
import * as dishesRepo from './dishes.repo.ts';
import * as repo from './entries.repo.ts';

// Календар меню ведуть усі учасники домогосподарства, як і довідники меню. Назву й ціну страви
// календар щоразу читає з довідників: вартість рахується за поточними цінами й не зберігається.

function toDto(row: repo.MenuEntryWithNames, dish: DishSummary | undefined): MenuEntry {
  const portionPrice = dish?.portionPrice ?? 0;
  return {
    id: row.id,
    date: row.date,
    mealTypeId: row.mealTypeId,
    dishId: row.dishId,
    dishName: row.dishName,
    servings: row.servings,
    portionPrice,
    cost: menuEntryCost(portionPrice, row.servings),
    isPriceComplete: dish?.isPriceComplete ?? true,
    unpricedCount: dish?.unpricedCount ?? 0,
  };
}

/** Порядок: дата, позиція прийому їжі, прийом їжі, назва страви, id. */
function compareEntries(a: repo.MenuEntryWithNames, b: repo.MenuEntryWithNames): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.mealTypePosition !== b.mealTypePosition) return a.mealTypePosition - b.mealTypePosition;
  if (a.mealTypeId !== b.mealTypeId) return a.mealTypeId < b.mealTypeId ? -1 : 1;
  return compareProductNames(a.dishName, b.dishName) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function toDtos(
  db: DbOrTx,
  auth: AuthContext,
  rows: readonly repo.MenuEntryWithNames[],
): Promise<MenuEntry[]> {
  const prices = await repo.listDishPrices(
    db,
    auth.householdId,
    rows.map((row) => row.dishId),
  );
  return [...rows].sort(compareEntries).map((row) => toDto(row, prices.get(row.dishId)));
}

async function loadEntry(db: DbOrTx, auth: AuthContext, id: string): Promise<MenuEntry> {
  const row = await repo.findEntry(db, auth.householdId, id);
  if (!row) throw notFound('Запис меню');
  const [entry] = await toDtos(db, auth, [row]);
  return entry!;
}

/** Підсумки по днях; дні без записів не потрапляють. Записи вже впорядковані за датою. */
function toDays(entries: readonly MenuEntry[]): MenuDay[] {
  const byDate = new Map<string, MenuEntry[]>();
  for (const entry of entries) {
    const day = byDate.get(entry.date) ?? [];
    day.push(entry);
    byDate.set(entry.date, day);
  }
  return [...byDate].map(([date, dayEntries]) => {
    const { cost, isPriceComplete } = menuCostTotal(dayEntries);
    return { date, cost, isPriceComplete, entryCount: dayEntries.length };
  });
}

/** Меню за період [from, to) з вартістю записів, днів і всього періоду. */
export async function getMenuPeriod(
  db: Db,
  auth: AuthContext,
  { from, to }: MenuPeriodQuery,
): Promise<MenuPeriod> {
  const entries = await toDtos(db, auth, await repo.listEntries(db, auth.householdId, from, to));
  return {
    from,
    to,
    currency: DEFAULT_CURRENCY,
    entries,
    days: toDays(entries),
    total: menuCostTotal(entries),
  };
}

const tooManyServings = () => badRequest('Не більше 99 порцій');

/**
 * Додає страву в прийом їжі дня. Повторне додавання тієї самої страви збільшує порції наявного
 * запису (created = false).
 */
export async function createEntry(
  db: Db,
  auth: AuthContext,
  input: CreateMenuEntryInput,
): Promise<{ entry: MenuEntry; created: boolean }> {
  if (!(await findMealType(db, auth.householdId, input.mealTypeId))) {
    throw notFound('Прийом їжі');
  }
  if (!(await dishesRepo.findDish(db, auth.householdId, input.dishId))) {
    throw notFound('Страва');
  }
  let result: { row: repo.MenuEntryRow; created: boolean };
  try {
    result = await repo.insertOrAddServings(db, auth.householdId, input);
  } catch (error) {
    if (isCheckViolation(error)) throw tooManyServings();
    // Прийом їжі чи страву видалили між перевіркою й вставкою.
    if (isForeignKeyViolation(error)) throw notFound('Страва чи прийом їжі');
    throw error;
  }
  return { entry: await loadEntry(db, auth, result.row.id), created: result.created };
}

export async function updateEntry(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateMenuEntryInput,
): Promise<MenuEntry> {
  if (!(await repo.updateServings(db, auth.householdId, id, input.servings))) {
    throw notFound('Запис меню');
  }
  return loadEntry(db, auth, id);
}

/** Прибирає страву з дня; страва й прийом їжі в довідниках лишаються. */
export async function deleteEntry(db: Db, auth: AuthContext, id: string): Promise<void> {
  if (!(await repo.deleteEntry(db, auth.householdId, id))) throw notFound('Запис меню');
}
