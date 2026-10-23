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

const shortMonthFormatter = new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'UTC' });

/** «2026-10» -> «жовт. 26» — підпис місяця на осі графіка. */
export function shortMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const name = shortMonthFormatter.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return `${name} ${String(year).slice(2)}`;
}

/** Частка у відсотках з одним знаком: 0,4245 -> «42,5%». */
export function percentText(ratio: number): string {
  return `${(Math.round(ratio * 1000) / 10).toFixed(1).replace('.', ',')}%`;
}

const shortDateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Коротка дата в часовому поясі: «05.10», а для іншого року — «05.10.2025». */
export function formatShortDate(instant: string, timeZone: string, now = new Date()): string {
  let formatter = shortDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    shortDateFormatters.set(timeZone, formatter);
  }
  // en-CA дає «2026-10-05» — той самий вигляд, що й дати без часу.
  const date = formatter.format(new Date(instant));
  const sameYear = date.slice(0, 4) === formatter.format(now).slice(0, 4);
  return sameYear ? formatDayMonth(date) : formatDateString(date);
}
