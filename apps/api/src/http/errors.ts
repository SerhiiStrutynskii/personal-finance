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
