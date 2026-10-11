const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Дата в часовому поясі користувача, наприклад «1 бер. 2026 р.». */
export function formatDate(instant: string, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('uk-UA', { timeZone, dateStyle: 'medium' });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(instant));
}
