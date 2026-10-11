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

const monthFormatter = new Intl.DateTimeFormat('uk-UA', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** «2026-10» -> «Жовтень 2026». */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const text = monthFormatter
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .replace(/\s*р\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «2026-10-05» -> «05.10». */
export function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

/** «2026-10-05» -> «05.10.2026». */
export function formatDateString(date: string): string {
  return `${formatDayMonth(date)}.${date.slice(0, 4)}`;
}
