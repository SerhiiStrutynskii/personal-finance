/** Тести очищають таблиці, тому працюють лише з базою, назва якої закінчується на _test. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Задайте TEST_DATABASE_URL (див. apps/api/.env.example)');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL має вказувати на базу з назвою, що закінчується на _test');
  }
  return url;
}
