export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = 'Потрібна авторизація') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what}: не знайдено`);
export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
export const tooManyRequests = () =>
  new AppError(429, 'TOO_MANY_REQUESTS', 'Забагато спроб. Спробуйте пізніше');
/** Видаток не можна створити чи перенести на майбутню дату. */
export const expenseDateInFuture = () =>
  new AppError(422, 'EXPENSE_DATE_IN_FUTURE', 'Видаток не можна додати на майбутню дату');
/** Бюджет не можна створити для місяця, що вже минув. */
export const budgetPeriodClosed = () =>
  new AppError(
    422,
    'BUDGET_PERIOD_CLOSED',
    'Бюджет можна створити лише для поточного або майбутнього місяця',
  );
/** Запит коректний за формою, але порушує правило домену, яке має власний код. */
export const unprocessable = (code: string, message: string) => new AppError(422, code, message);
/** Реєстрацію нових користувачів вимкнено налаштуванням сервера. */
export const registrationClosed = () =>
  new AppError(403, 'REGISTRATION_CLOSED', 'Реєстрацію нових користувачів закрито');
/** Дію може виконати лише власник домогосподарства. */
export const ownerOnly = () =>
  new AppError(403, 'OWNER_ONLY', 'Це може змінити лише власник домогосподарства');
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

// ON DELETE RESTRICT повідомляє 23001, звичайний зовнішній ключ — 23503
const PG_FOREIGN_KEY_VIOLATIONS = ['23001', '23503'];
const PG_UNIQUE_VIOLATION = '23505';

function pgCode(error: unknown): string | undefined {
  // drizzle загортає помилку драйвера в cause
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string') return e.code;
  }
  return undefined;
}

export const isForeignKeyViolation = (error: unknown) =>
  PG_FOREIGN_KEY_VIOLATIONS.includes(pgCode(error) ?? '');
export const isUniqueViolation = (error: unknown) => pgCode(error) === PG_UNIQUE_VIOLATION;
