import { eq } from 'drizzle-orm';
import { parseMoney } from '@hf/shared';
import { loadEnv } from '../config/env.ts';
import { hashPassword } from '../modules/auth/password.ts';
import { createDb } from './client.ts';
import {
  accounts,
  categories,
  householdMembers,
  households,
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

try {
  const [existing] = await db.select().from(users).where(eq(users.id, DEMO_USER_ID));
  if (existing) {
    if (!existing.passwordHash) {
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      await db.update(users).set({ passwordHash }).where(eq(users.id, DEMO_USER_ID));
    }
    console.log('Демо-дані вже є, пропускаю');
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
    });
    console.log('Демо-дані створено');
  }
  console.log(`Вхід для розробки: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await pool.end();
}
