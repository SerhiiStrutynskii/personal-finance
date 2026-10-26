import { describe, expect, it } from 'vitest';
import { buildExpensesCsv, type ExpenseCsvRow } from '../csv.ts';

const KYIV = 'Europe/Kyiv';
const BOM = '﻿';
const HEADER = 'Дата;Сума;Валюта;Категорія;Рахунок;Опис';

function row(overrides: Partial<ExpenseCsvRow> = {}): ExpenseCsvRow {
  return {
    occurredAt: new Date('2026-03-01T10:30:00Z'),
    amountMinor: 128450,
    currency: 'UAH',
    description: 'Супермаркет',
    accountName: 'Картка',
    categoryName: 'Продукти',
    parentCategoryName: null,
    ...overrides,
  };
}

/** Рядки даних без BOM, заголовка й завершального порожнього рядка. */
function dataLines(rows: ExpenseCsvRow[]): string[] {
  const csv = buildExpensesCsv(rows, KYIV);
  expect(csv.endsWith('\r\n')).toBe(true);
  return csv.slice(BOM.length + HEADER.length + 2, -2).split('\r\n');
}

/** Окреме поле рядка за номером колонки (лише для рядків без лапок). */
function field(overrides: Partial<ExpenseCsvRow>, index: number): string {
  return dataLines([row(overrides)])[0]!.split(';')[index]!;
}

describe('buildExpensesCsv', () => {
  it('порожній список — лише BOM і заголовок', () => {
    expect(buildExpensesCsv([], KYIV)).toBe(`${BOM}${HEADER}\r\n`);
  });

  it('починається з BOM і заголовка, рядки через \\r\\n, наприкінці теж \\r\\n', () => {
    const csv = buildExpensesCsv([row(), row({ description: 'Аптека' })], KYIV);
    expect(csv).toBe(
      `${BOM}${HEADER}\r\n` +
        '2026-03-01;1284,50;UAH;Продукти;Картка;Супермаркет\r\n' +
        '2026-03-01;1284,50;UAH;Продукти;Картка;Аптека\r\n',
    );
  });

  it('детермінована: той самий вхід дає той самий результат', () => {
    const rows = [row(), row({ amountMinor: 1 })];
    expect(buildExpensesCsv(rows, KYIV)).toBe(buildExpensesCsv(rows, KYIV));
  });

  it('зберігає порядок вхідних рядків', () => {
    const lines = dataLines([row({ description: 'Перша' }), row({ description: 'Друга' })]);
    expect(lines.map((line) => line.split(';')[5])).toEqual(['Перша', 'Друга']);
  });

  describe('сума', () => {
    it.each([
      ['UAH', 128450, '1284,50'],
      ['UAH', 1, '0,01'],
      ['UAH', 10, '0,10'],
      ['UAH', 100, '1,00'],
      ['UAH', 123456789, '1234567,89'],
      ['JPY', 500, '500'],
      ['USD', 1000, '10,00'],
      // понад 2^31 і до межі безпечного цілого — без втрати точності
      ['UAH', 2 ** 31 + 1, '21474836,49'],
      ['UAH', 900719925474099, '9007199254740,99'],
      ['UAH', Number.MAX_SAFE_INTEGER, '90071992547409,91'],
    ])('%s %d -> %s', (currency, amountMinor, expected) => {
      expect(field({ currency, amountMinor }, 1)).toBe(expected);
      expect(field({ currency, amountMinor }, 2)).toBe(currency);
    });
  });

  describe('дата в часовому поясі домогосподарства', () => {
    it.each([
      // межа доби й місяця взимку (UTC+2)
      ['2026-02-28T21:59:59Z', '2026-02-28'],
      ['2026-02-28T22:00:00Z', '2026-03-01'],
      ['2026-02-28T22:30:00Z', '2026-03-01'],
      // 1 квітня 00:00 за Києвом (UTC+3)
      ['2026-03-31T20:59:59Z', '2026-03-31'],
      ['2026-03-31T21:00:00Z', '2026-04-01'],
      // день переходу на літній час (29.03.2026)
      ['2026-03-28T21:59:59Z', '2026-03-28'],
      ['2026-03-28T22:00:00Z', '2026-03-29'],
      ['2026-03-29T00:59:59Z', '2026-03-29'],
      ['2026-03-29T01:00:00Z', '2026-03-29'],
      ['2026-03-29T20:59:59Z', '2026-03-29'],
      ['2026-03-29T21:00:00Z', '2026-03-30'],
      // день переходу на зимовий час (25.10.2026)
      ['2026-10-24T20:59:59Z', '2026-10-24'],
      ['2026-10-24T21:00:00Z', '2026-10-25'],
      ['2026-10-25T21:59:59Z', '2026-10-25'],
      ['2026-10-25T22:00:00Z', '2026-10-26'],
    ])('%s -> %s', (instant, expected) => {
      expect(field({ occurredAt: new Date(instant) }, 0)).toBe(expected);
    });
  });

  describe('категорія', () => {
    it('підкатегорія з батьком', () => {
      expect(field({ categoryName: 'Вода', parentCategoryName: 'Комунальні' }, 3)).toBe(
        'Комунальні › Вода',
      );
    });

    it('без категорії', () => {
      expect(field({ categoryName: null, parentCategoryName: null }, 3)).toBe('Без категорії');
    });
  });

  describe('екранування', () => {
    it.each([
      ['крапка з комою', 'Хліб; молоко', '"Хліб; молоко"'],
      ['лапки', 'Кафе "Ромашка"', '"Кафе ""Ромашка"""'],
      ['перенос рядка', 'рядок 1\nрядок 2', '"рядок 1\nрядок 2"'],
      ['\\r\\n всередині', 'рядок 1\r\nрядок 2', '"рядок 1\r\nрядок 2"'],
      ['кома не потребує лапок', 'Хліб, молоко', 'Хліб, молоко'],
      ['порожній опис', '', ''],
    ])('%s', (_name, description, expected) => {
      const csv = buildExpensesCsv([row({ description })], KYIV);
      expect(csv).toBe(`${BOM}${HEADER}\r\n2026-03-01;1284,50;UAH;Продукти;Картка;${expected}\r\n`);
    });

    it('екранує назви рахунку й категорії так само', () => {
      const csv = buildExpensesCsv(
        [row({ accountName: 'Картка; "Моно"', categoryName: 'Їжа;кафе' })],
        KYIV,
      );
      expect(csv).toContain(';"Їжа;кафе";"Картка; ""Моно""";Супермаркет\r\n');
    });
  });

  describe('захист від formula injection', () => {
    it.each([
      ['=SUM(A1)', "'=SUM(A1)"],
      ['+380', "'+380"],
      ['-5', "'-5"],
      ['@cmd', "'@cmd"],
      ['\tтаб', "'\tтаб"],
      ['звичайний = текст', 'звичайний = текст'],
    ])('опис %j -> %j', (description, expected) => {
      expect(field({ description }, 5)).toBe(expected);
    });

    it('опис із \\r на початку отримує апостроф і лапки', () => {
      expect(dataLines([row({ description: '\rx' })])[0]).toBe(
        '2026-03-01;1284,50;UAH;Продукти;Картка;"\'\rx"',
      );
    });

    it('формула з лапками: спершу апостроф, потім екранування', () => {
      expect(dataLines([row({ description: '=HYPERLINK("x";"y")' })])[0]).toBe(
        '2026-03-01;1284,50;UAH;Продукти;Картка;"\'=HYPERLINK(""x"";""y"")"',
      );
    });

    it('захищає назви категорії й рахунку', () => {
      const line = dataLines([row({ categoryName: '=1+1', accountName: '@Картка' })])[0];
      expect(line).toBe("2026-03-01;1284,50;UAH;'=1+1;'@Картка;Супермаркет");
    });

    it('батьківська категорія з формулою захищена через початок повної назви', () => {
      expect(field({ categoryName: 'Вода', parentCategoryName: '-Комунальні' }, 3)).toBe(
        "'-Комунальні › Вода",
      );
    });
  });
});
