// Правила повторення періодичного прибутку. Дати — календарні, рядки YYYY-MM-DD у часовому поясі
// домогосподарства; рядками, а не Date, щоб вони не зсувалися між часовими поясами.

export type DateString = string;

export type IncomeFrequency = 'monthly' | 'weekly' | 'biweekly' | 'every_n_months';

export interface RecurrenceRule {
  frequency: IncomeFrequency;
  /** 1–31 для monthly / every_n_months; у коротшому місяці — його останній день. */
  dayOfMonth?: number | null | undefined;
  /** 1–7, понеділок = 1, для weekly / biweekly. */
  dayOfWeek?: number | null | undefined;
  /** Крок у місяцях для every_n_months. */
  intervalMonths?: number | null | undefined;
  startDate: DateString;
  /** Останній можливий день надходження, включно. */
  endDate?: DateString | null | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (date: DateString) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (time: number): DateString => new Date(time).toISOString().slice(0, 10);

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = toUtc(value);
  return !Number.isNaN(time) && fromUtc(time) === value;
}

export function addDays(date: DateString, days: number): DateString {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** День тижня за ISO: понеділок = 1, неділя = 7. */
export function isoWeekday(date: DateString): number {
  return new Date(toUtc(date)).getUTCDay() || 7;
}

function dateInMonth(monthIndex: number, dayOfMonth: number): DateString {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth)));
}

const monthIndexOf = (date: DateString) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/**
 * Дати надходжень за правилом у періоді [from, to): from включно, to виключно.
 * Перше надходження — найближча дата за правилом, не раніша за startDate;
 * endDate враховується включно. Рядки YYYY-MM-DD порівнюються як звичайні рядки.
 */
export function generateOccurrenceDates(
  rule: RecurrenceRule,
  from: DateString,
  to: DateString,
): DateString[] {
  const lower = from > rule.startDate ? from : rule.startDate;
  // Верхня межа виключна: або кінець періоду, або наступний день після endDate.
  const afterEnd = rule.endDate ? addDays(rule.endDate, 1) : undefined;
  const upper = afterEnd && afterEnd < to ? afterEnd : to;
  if (lower >= upper) return [];

  const dates: DateString[] = [];

  if (rule.frequency === 'weekly' || rule.frequency === 'biweekly') {
    const step = rule.frequency === 'weekly' ? 7 : 14;
    const dayOfWeek = rule.dayOfWeek ?? isoWeekday(rule.startDate);
    const first = addDays(rule.startDate, (dayOfWeek - isoWeekday(rule.startDate) + 7) % 7);
    // Перестрибуємо до першого надходження в періоді, зберігаючи крок від першої дати.
    const skipped = Math.max(0, Math.ceil((toUtc(lower) - toUtc(first)) / DAY_MS / step));
    for (let date = addDays(first, skipped * step); date < upper; date = addDays(date, step)) {
      dates.push(date);
    }
    return dates;
  }

  const interval = rule.frequency === 'monthly' ? 1 : Math.max(1, rule.intervalMonths ?? 1);
  const dayOfMonth = rule.dayOfMonth ?? Number(rule.startDate.slice(8, 10));
  const startIndex = monthIndexOf(rule.startDate);
  const skipped = Math.max(0, Math.floor((monthIndexOf(lower) - startIndex) / interval));
  for (let index = startIndex + skipped * interval; ; index += interval) {
    const date = dateInMonth(index, dayOfMonth);
    if (date >= upper) break;
    if (date >= lower) dates.push(date);
  }
  return dates;
}

/** Найближчі `count` дат надходжень, починаючи з `from` включно — для прев'ю правила. */
export function previewOccurrenceDates(
  rule: RecurrenceRule,
  from: DateString,
  count: number,
): DateString[] {
  // Десяти років досить для будь-якого допустимого кроку.
  const horizon = `${Number(from.slice(0, 4)) + 10}${from.slice(4)}`;
  return generateOccurrenceDates(rule, from, horizon).slice(0, count);
}
