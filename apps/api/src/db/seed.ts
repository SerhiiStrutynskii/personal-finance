import { eq } from 'drizzle-orm';
import { parseMoney, parseQuantity, productNameKey } from '@hf/shared';
import { loadEnv } from '../config/env.ts';
import { hashPassword } from '../modules/auth/password.ts';
import { createDb, type DbOrTx } from './client.ts';
import {
  accounts,
  categories,
  householdMembers,
  households,
  products,
  shoppingListItems,
  shoppingLists,
  transactions,
  users,
} from './schema.ts';

// Усі дані вигадані; обліковий запис призначений лише для локальної розробки.
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo-password';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Сід не можна запускати в production');

const { db, pool } = createDb(env.DATABASE_URL);
const uah = (value: string) => parseMoney(value, 'UAH').amountMinor;
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const HOUR = 60 * 60 * 1000;

type Unit = (typeof products.$inferInsert)['unit'];

// Довідник: одиниця й поточна ціна — остання фактична ціна з історії нижче.
const PRODUCTS: [name: string, unit: Unit, price: string | null, archived?: boolean][] = [
  ['Хліб', 'pcs', '32'],
  ['Молоко', 'l', '44'],
  ['Яйця', 'pcs', '5.80'],
  ['Куряче філе', 'kg', '209'],
  ['Рис', 'kg', '58'],
  ['Кава мелена', 'pack', '289'],
  ['Яблука', 'kg', '45'],
  ['Сир твердий', 'kg', '389.90'],
  ['Банани', 'kg', '64.90'],
  ['Олія соняшникова', 'l', '89'],
  ['Засіб для посуду', 'pack', null],
  ['Сік апельсиновий', 'l', '79', true],
];

// Рядок: продукт, кількість, очікувана ціна, фактична ціна (null — ще не куплено).
type Line = [name: string, quantity: string, expected: string | null, actual: string | null];

// Минулий місяць, тиждень тому й сьогодні: є з чим порівняти в аналітиці покупок.
const LISTS: { name: string; daysAgo: number; lines: Line[] }[] = [
  {
    name: 'Велика закупка',
    daysAgo: 35,
    lines: [
      ['Хліб', '2', '30', '30'],
      ['Молоко', '2', '41', '41.50'],
      ['Яйця', '10', '5.50', '5.80'],
      ['Куряче філе', '1.2', '205', '209'],
      ['Рис', '1', '58', '58'],
      ['Кава мелена', '1', '275', '289'],
    ],
  },
  {
    name: 'Субота',
    daysAgo: 9,
    lines: [
      ['Хліб', '2', '30', '32'],
      ['Молоко', '2', '41.50', '42.50'],
      ['Яблука', '1.5', '42', '45'],
      ['Сир твердий', '0.35', '380', '389.90'],
      ['Банани', '1', '69.90', '64.90'],
    ],
  },
  {
    name: 'На вихідні',
    daysAgo: 0,
    lines: [
      ['Хліб', '1', '32', '32'],
      ['Молоко', '1', '42.50', '44'],
      ['Яйця', '10', '5.80', null],
      ['Куряче філе', '1', '209', null],
      ['Олія соняшникова', '1', '89', null],
      ['Засіб для посуду', '1', null, null],
    ],
  },
];

/** Довідник продуктів і списки покупок демо-домогосподарства; лише якщо продуктів ще немає. */
async function seedShopping(tx: DbOrTx, householdId: string): Promise<boolean> {
  const [anyProduct] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.householdId, householdId))
    .limit(1);
  if (anyProduct) return false;

  const rows = await tx
    .insert(products)
    .values(
      PRODUCTS.map(([name, unit, price, archived]) => ({
        householdId,
        name,
        nameKey: productNameKey(name),
        unit,
        priceMinor: price === null ? null : uah(price),
        isArchived: archived ?? false,
      })),
    )
    .returning({ id: products.id, name: products.name });
  const productId = new Map(rows.map((row) => [row.name, row.id]));

  for (const spec of LISTS) {
    // Список складено за дві години до цього моменту, куплено — через годину після того.
    const createdAt = new Date(daysAgo(spec.daysAgo).getTime() - 2 * HOUR);
    const boughtAt = new Date(createdAt.getTime() + HOUR);
    const [list] = await tx
      .insert(shoppingLists)
      .values({ householdId, name: spec.name, createdBy: DEMO_USER_ID, createdAt })
      .returning();
    await tx.insert(shoppingListItems).values(
      spec.lines.map(([name, quantity, expected, actual], position) => ({
        listId: list!.id,
        productId: productId.get(name)!,
        quantityMilli: parseQuantity(quantity),
        expectedUnitPriceMinor: expected === null ? null : uah(expected),
        actualUnitPriceMinor: actual === null ? null : uah(actual),
        isBought: actual !== null,
        boughtAt: actual === null ? null : boughtAt,
        position,
      })),
    );
  }
  return true;
}

try {
  const [existing] = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));
  if (existing) {
    if (!existing.passwordHash) {
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      await db.update(users).set({ passwordHash }).where(eq(users.id, DEMO_USER_ID));
    }
    const [membership] = await db
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, DEMO_USER_ID));
    const added =
      membership && (await db.transaction((tx) => seedShopping(tx, membership.householdId)));
    console.log(added ? 'Додано демо-продукти й списки покупок' : 'Демо-дані вже є, пропускаю');
  } else {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({ id: DEMO_USER_ID, email: DEMO_EMAIL, name: 'Демо Користувач', passwordHash });
      const [household] = await tx.insert(households).values({ name: 'Демо-родина' }).returning();
      const householdId = household!.id;
      await tx
        .insert(householdMembers)
        .values({ householdId, userId: DEMO_USER_ID, role: 'owner' });

      const [card, cash, deposit] = await tx
        .insert(accounts)
        .values([
          { householdId, name: 'Картка', type: 'card' },
          { householdId, name: 'Готівка', type: 'cash' },
          { householdId, name: 'Депозит', type: 'deposit' },
        ])
        .returning();

      const [salary, groceries, transport, utilities] = await tx
        .insert(categories)
        .values([
          { householdId, name: 'Зарплата', kind: 'income' },
          { householdId, name: 'Продукти', kind: 'expense' },
          { householdId, name: 'Транспорт', kind: 'expense' },
          { householdId, name: 'Комунальні', kind: 'expense' },
        ])
        .returning();

      const common = { householdId, createdBy: DEMO_USER_ID, currency: 'UAH' };
      await tx.insert(transactions).values([
        {
          ...common,
          type: 'income',
          accountId: card!.id,
          categoryId: salary!.id,
          amountMinor: uah('42000'),
          description: 'Зарплата',
          occurredAt: daysAgo(20),
        },
        {
          ...common,
          type: 'expense',
          accountId: card!.id,
          categoryId: groceries!.id,
          amountMinor: uah('1284.50'),
          description: 'Супермаркет',
          occurredAt: daysAgo(18),
        },
        {
          ...common,
          type: 'expense',
          accountId: card!.id,
          categoryId: utilities!.id,
          amountMinor: uah('3150'),
          description: 'Комунальні послуги',
          occurredAt: daysAgo(15),
        },
        {
          ...common,
          type: 'transfer',
          accountId: card!.id,
          toAccountId: cash!.id,
          amountMinor: uah('2000'),
          description: 'Зняття готівки',
          occurredAt: daysAgo(12),
        },
        {
          ...common,
          type: 'expense',
          accountId: cash!.id,
          categoryId: transport!.id,
          amountMinor: uah('96'),
          description: 'Проїзд',
          occurredAt: daysAgo(10),
        },
        {
          ...common,
          type: 'expense',
          accountId: cash!.id,
          categoryId: groceries!.id,
          amountMinor: uah('412.75'),
          description: 'Ринок',
          occurredAt: daysAgo(7),
        },
        {
          ...common,
          type: 'transfer',
          accountId: card!.id,
          toAccountId: deposit!.id,
          amountMinor: uah('5000'),
          description: 'Поповнення депозиту',
          occurredAt: daysAgo(5),
        },
        {
          ...common,
          type: 'expense',
          accountId: card!.id,
          categoryId: null,
          amountMinor: uah('249.99'),
          description: 'Без категорії',
          occurredAt: daysAgo(2),
        },
      ]);
      await seedShopping(tx, householdId);
    });
    console.log('Демо-дані створено');
  }
  console.log(`Вхід для розробки: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await pool.end();
}
