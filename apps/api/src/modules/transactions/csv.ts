import { categoryPathName, localDateKey, toDecimalString } from '@hf/shared';

/** Рядок витрати для експорту; назви вже розв'язані запитом. */
export interface ExpenseCsvRow {
  occurredAt: Date;
  amountMinor: number;
  currency: string;
  description: string;
  accountName: string;
  categoryName: string | null;
  parentCategoryName: string | null;
}

const BOM = '﻿';
const SEPARATOR = ';';
const LINE_END = '\r\n';
const HEADER = ['Дата', 'Сума', 'Валюта', 'Категорія', 'Рахунок', 'Опис'];
const NO_CATEGORY = 'Без категорії';

/** Перші символи, з яких Excel чи Sheets можуть почати формулу. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[;"\r\n]/;

/** Екранування поля за RFC 4180 (з роздільником `;`). */
function escapeField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Текст, який вводить користувач: захист від formula injection, потім екранування. */
function textField(value: string): string {
  return escapeField(FORMULA_START.test(value) ? `'${value}` : value);
}

/** Сума з десятковою комою, без розділювача тисяч і символу валюти: 128450 UAH -> "1284,50". */
function amountField(amountMinor: number, currency: string): string {
  return toDecimalString({ amountMinor, currency }).replace('.', ',');
}

/**
 * CSV витрат для Excel з українською локаллю: UTF-8 з BOM, роздільник `;`, рядки через `\r\n`.
 * Дата — локальна дата в часовому поясі домогосподарства. Порядок рядків — як у вхідному списку.
 */
export function buildExpensesCsv(rows: readonly ExpenseCsvRow[], timeZone: string): string {
  const lines = [HEADER.join(SEPARATOR)];
  for (const row of rows) {
    const category = row.categoryName
      ? categoryPathName(row.categoryName, row.parentCategoryName)
      : NO_CATEGORY;
    lines.push(
      [
        localDateKey(row.occurredAt, timeZone),
        amountField(row.amountMinor, row.currency),
        row.currency,
        textField(category),
        textField(row.accountName),
        textField(row.description),
      ].join(SEPARATOR),
    );
  }
  return BOM + lines.join(LINE_END) + LINE_END;
}
