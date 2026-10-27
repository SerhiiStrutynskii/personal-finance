import {
  addDays,
  compareProductNames,
  type ApplyMenuDayTemplateInput,
  type CreateMenuDayTemplateInput,
  type MenuDayTemplate,
  type MenuPeriod,
  type UpdateMenuDayTemplateInput,
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
import * as entriesRepo from './entries.repo.ts';
import { getMenuPeriod } from './entries.service.ts';
import * as repo from './templates.repo.ts';

// Шаблони меню дня ведуть усі учасники домогосподарства, як і календар; ролі не перевіряються.
// Шаблон — копія записів дня на момент збереження; ціни й назви в ньому не зберігаються.

const toDto = (row: repo.MenuDayTemplateWithCount): MenuDayTemplate => ({
  id: row.id,
  name: row.name,
  itemCount: row.itemCount,
  createdAt: row.createdAt.toISOString(),
});

/** Назва унікальна в домогосподарстві без урахування регістру й пробілів по краях. */
function rethrowDuplicate(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('Шаблон з такою назвою вже є');
  throw error;
}

/** Шаблони за українським алфавітом, з кількістю позицій. */
export async function listTemplates(db: Db, auth: AuthContext): Promise<MenuDayTemplate[]> {
  const rows = await repo.listTemplates(db, auth.householdId);
  return rows.sort((a, b) => compareProductNames(a.name, b.name)).map(toDto);
}

/** Копіює всі записи дня свого домогосподарства в новий шаблон; порожній день — 400. */
export async function createTemplate(
  db: Db,
  auth: AuthContext,
  input: CreateMenuDayTemplateInput,
): Promise<MenuDayTemplate> {
  try {
    return await db.transaction(async (tx) => {
      const items = await entriesRepo.listDayEntryRows(tx, auth.householdId, input.date);
      if (items.length === 0) throw badRequest('У дні немає страв чи продуктів');
      return toDto(await repo.insertTemplate(tx, auth.householdId, { name: input.name, items }));
    });
  } catch (error) {
    // Страву чи прийом їжі видалили між читанням дня й вставкою позицій.
    if (isForeignKeyViolation(error)) throw notFound('Страва чи прийом їжі');
    rethrowDuplicate(error);
  }
}

export async function renameTemplate(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateMenuDayTemplateInput,
): Promise<MenuDayTemplate> {
  let renamed: boolean;
  try {
    renamed = await repo.renameTemplate(db, auth.householdId, id, input.name);
  } catch (error) {
    rethrowDuplicate(error);
  }
  const row = renamed ? await repo.findTemplate(db, auth.householdId, id) : undefined;
  if (!row) throw notFound('Шаблон');
  return toDto(row);
}

/** Видаляє шаблон із позиціями; записи календаря не змінюються. */
export async function deleteTemplate(db: Db, auth: AuthContext, id: string): Promise<void> {
  if (!(await repo.deleteTemplate(db, auth.householdId, id))) throw notFound('Шаблон');
}

/**
 * Замінює всі записи дня позиціями шаблону в одній транзакції й повертає меню цього дня.
 * Шаблон без позицій — 400, день не змінюється. Архівні продукти вставляються як є.
 */
export async function applyTemplate(
  db: Db,
  auth: AuthContext,
  id: string,
  { date }: ApplyMenuDayTemplateInput,
): Promise<MenuPeriod> {
  try {
    await db.transaction(async (tx) => {
      if (!(await repo.findTemplate(tx, auth.householdId, id))) throw notFound('Шаблон');
      const items = await repo.listTemplateItems(tx, auth.householdId, id);
      if (items.length === 0) throw badRequest('Шаблон порожній');
      await entriesRepo.deleteDayEntries(tx, auth.householdId, date);
      await entriesRepo.insertEntries(tx, auth.householdId, date, items);
    });
  } catch (error) {
    // Страву чи прийом їжі видалили паралельно: транзакція відкотилася, день не змінився.
    if (isForeignKeyViolation(error)) throw notFound('Страва чи прийом їжі');
    throw error;
  }
  return getMenuPeriod(db, auth, { from: date, to: addDays(date, 1) });
}
