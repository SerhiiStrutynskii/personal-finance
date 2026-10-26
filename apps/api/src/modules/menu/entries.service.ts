import {
  DEFAULT_CURRENCY,
  compareProductNames,
  menuCostTotal,
  menuEntryCost,
  menuProductEntryCost,
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
import { findProduct } from '../shopping/repo.ts';
import { findMealType } from './mealTypes.repo.ts';
import * as dishesRepo from './dishes.repo.ts';
import * as repo from './entries.repo.ts';

// Календар меню ведуть усі учасники домогосподарства, як і довідники меню. Назву й ціну страви
// чи продукту календар щоразу читає з довідників: вартість рахується за поточними цінами й не
// зберігається.

function toDto(row: repo.MenuEntryWithNames, dish: DishSummary | undefined): MenuEntry {
  const common = { id: row.id, date: row.date, mealTypeId: row.mealTypeId, name: row.name };
  if (row.kind === 'product') {
    return {
      ...common,
      kind: 'product',
      productId: row.productId,
      unit: row.unit,
      isArchived: row.isArchived,
      quantityMilli: row.quantityMilli,
      unitPrice: row.priceMinor,
      ...menuProductEntryCost(row.quantityMilli, row.priceMinor),
    };
  }
  const portionPrice = dish?.portionPrice ?? 0;
  return {
    ...common,
    kind: 'dish',
    dishId: row.dishId,
    servings: row.servings,
    portionPrice,
    cost: menuEntryCost(portionPrice, row.servings),
    isPriceComplete: dish?.isPriceComplete ?? true,
    unpricedCount: dish?.unpricedCount ?? 0,
  };
}

/** Порядок: дата, позиція прийому їжі, прийом їжі, назва (страви й продукти разом), id. */
function compareEntries(a: repo.MenuEntryWithNames, b: repo.MenuEntryWithNames): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.mealTypePosition !== b.mealTypePosition) return a.mealTypePosition - b.mealTypePosition;
  if (a.mealTypeId !== b.mealTypeId) return a.mealTypeId < b.mealTypeId ? -1 : 1;
  return compareProductNames(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

async function toDtos(
  db: DbOrTx,
  auth: AuthContext,
  rows: readonly repo.MenuEntryWithNames[],
): Promise<MenuEntry[]> {
  const prices = await repo.listDishPrices(
    db,
    auth.householdId,
    rows.flatMap((row) => (row.kind === 'dish' ? [row.dishId] : [])),
  );
  return [...rows]
    .sort(compareEntries)
    .map((row) => toDto(row, row.kind === 'dish' ? prices.get(row.dishId) : undefined));
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
const tooMuchQuantity = () => badRequest('Кількість продукту завелика');

/**
 * Додає страву або продукт у прийом їжі дня. Повторне додавання тієї самої страви збільшує
 * порції, того самого продукту — кількість наявного запису (created = false). Архівний продукт
 * свого домогосподарства додати можна; він не розархівовується, як і в складі страви.
 */
export async function createEntry(
  db: Db,
  auth: AuthContext,
  input: CreateMenuEntryInput,
): Promise<{ entry: MenuEntry; created: boolean }> {
  if (!(await findMealType(db, auth.householdId, input.mealTypeId))) {
    throw notFound('Прийом їжі');
  }
  let result: { row: repo.MenuEntryRow; created: boolean };
  if ('productId' in input) {
    if (!(await findProduct(db, auth.householdId, input.productId))) throw notFound('Продукт');
    try {
      result = await repo.insertOrAddQuantity(db, auth.householdId, input);
    } catch (error) {
      if (isCheckViolation(error, 'menu_entries_quantity_range')) throw tooMuchQuantity();
      // Прийом їжі чи продукт видалили між перевіркою й вставкою.
      if (isForeignKeyViolation(error)) throw notFound('Продукт чи прийом їжі');
      throw error;
    }
  } else {
    if (!(await dishesRepo.findDish(db, auth.householdId, input.dishId))) {
      throw notFound('Страва');
    }
    try {
      result = await repo.insertOrAddServings(db, auth.householdId, input);
    } catch (error) {
      if (isCheckViolation(error, 'menu_entries_servings_range')) throw tooManyServings();
      // Прийом їжі чи страву видалили між перевіркою й вставкою.
      if (isForeignKeyViolation(error)) throw notFound('Страва чи прийом їжі');
      throw error;
    }
  }
  return { entry: await loadEntry(db, auth, result.row.id), created: result.created };
}

/** Порції — лише для страви, кількість — лише для продукту; інакше 400 і запис не змінюється. */
export async function updateEntry(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateMenuEntryInput,
): Promise<MenuEntry> {
  const current = await repo.findEntry(db, auth.householdId, id);
  if (!current) throw notFound('Запис меню');
  let updated;
  if ('servings' in input) {
    if (current.kind !== 'dish') throw badRequest('Для продукту вказується кількість');
    updated = await repo.updateServings(db, auth.householdId, id, input.servings);
  } else {
    if (current.kind !== 'product') throw badRequest('Для страви вказуються порції');
    try {
      updated = await repo.updateQuantity(db, auth.householdId, id, input.quantityMilli);
    } catch (error) {
      if (isCheckViolation(error, 'menu_entries_quantity_range')) throw tooMuchQuantity();
      throw error;
    }
  }
  if (!updated) throw notFound('Запис меню');
  return loadEntry(db, auth, id);
}

/** Прибирає страву чи продукт з дня; у довідниках вони лишаються. */
export async function deleteEntry(db: Db, auth: AuthContext, id: string): Promise<void> {
  if (!(await repo.deleteEntry(db, auth.householdId, id))) throw notFound('Запис меню');
}
