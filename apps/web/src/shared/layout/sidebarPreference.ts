const KEY = 'hf.sidebar.open';

/** Збережений стан сайдбара; null — користувач ще не перемикав. */
export function readSidebarOpen(storage: Pick<Storage, 'getItem'>): boolean | null {
  try {
    const value = storage.getItem(KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

export function writeSidebarOpen(storage: Pick<Storage, 'setItem'>, open: boolean): void {
  try {
    storage.setItem(KEY, String(open));
  } catch {
    // Сховище недоступне (приватний режим) — стан просто не запам'ятається.
  }
}

/** Без збереженого вибору: розгорнутий на десктопі, згорнутий до іконок на планшеті. */
export function initialSidebarOpen(
  storage: Pick<Storage, 'getItem'>,
  viewportWidth: number,
): boolean {
  return readSidebarOpen(storage) ?? viewportWidth >= 1024;
}
