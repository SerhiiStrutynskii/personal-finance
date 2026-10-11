// Моменти часу зберігаються в UTC; дні й місяці рахуються в часовому поясі користувача.
// Усі періоди — півінтервали: початок включно, кінець виключно.

export const DEFAULT_TIME_ZONE = 'Europe/Kyiv';

export interface Period {
  start: Date;
  end: Date;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts as unknown as LocalParts;
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** UTC-момент, що відповідає півночі вказаної локальної дати (month: 1–12). */
export function startOfLocalDay(year: number, month: number, day: number, timeZone: string): Date {
  const wallClock = Date.UTC(year, month - 1, day);
  // Друга ітерація потрібна, коли зсув змінюється між здогадом і результатом (перехід DST).
  let utc = wallClock - offsetMs(new Date(wallClock), timeZone);
  utc = wallClock - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** Локальна дата моменту у форматі YYYY-MM-DD. */
export function localDateKey(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Локальний місяць моменту у форматі YYYY-MM. */
export function localMonthKey(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return localDateKey(instant, timeZone).slice(0, 7);
}

/** Календарний місяць (month: 1–12) у часовому поясі користувача як період [start, end). */
export function monthPeriod(
  year: number,
  month: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Period {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: startOfLocalDay(year, month, 1, timeZone),
    end: startOfLocalDay(next.year, next.month, 1, timeZone),
  };
}

export function isInPeriod(instant: Date, period: Period): boolean {
  const time = instant.getTime();
  return time >= period.start.getTime() && time < period.end.getTime();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}
