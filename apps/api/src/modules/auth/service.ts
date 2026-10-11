import { randomUUID } from 'node:crypto';
import type { Db, DbOrTx } from '../../db/client.ts';
import type { AuthContext } from '../../http/auth.ts';
import { conflict, isUniqueViolation, tooManyRequests, unauthorized } from '../../http/errors.ts';
import { hashPassword, verifyPassword } from './password.ts';
import type { RateLimiter } from './rate-limiter.ts';
import * as repo from './repo.ts';
import type { AuthSession, AuthTokens, CurrentUser, LoginInput, RegisterInput } from './schema.ts';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  type TokenService,
} from './tokens.ts';

export interface AuthDeps {
  db: Db;
  tokens: TokenService;
  loginLimiter: RateLimiter;
}

type Membership = NonNullable<Awaited<ReturnType<typeof repo.findMembership>>>;

const toCurrentUser = (user: repo.UserRow, household: Membership): CurrentUser => ({
  user: { id: user.id, email: user.email, name: user.name, timeZone: user.timeZone },
  household: { id: household.id, name: household.name, role: household.role },
});

async function issueTokens(
  db: DbOrTx,
  tokens: TokenService,
  userId: string,
  familyId: string = randomUUID(),
): Promise<AuthTokens> {
  const refreshToken = generateRefreshToken();
  await repo.insertRefreshToken(db, {
    userId,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return {
    accessToken: await tokens.signAccessToken(userId),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function register(
  { db, tokens }: AuthDeps,
  input: RegisterInput,
): Promise<AuthSession> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const user = await repo.insertUser(tx, {
        email: input.email,
        name: input.name,
        passwordHash,
      });
      const household = await repo.insertHouseholdWithOwner(tx, input.householdName, user.id);
      return {
        ...toCurrentUser(user, { ...household, role: 'owner' }),
        ...(await issueTokens(tx, tokens, user.id)),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('Користувач із таким email уже існує');
    throw error;
  }
}

export async function login(
  { db, tokens, loginLimiter }: AuthDeps,
  input: LoginInput,
  clientIp: string,
): Promise<AuthSession> {
  const limiterKey = `${clientIp}|${input.email}`;
  if (loginLimiter.isBlocked(limiterKey)) throw tooManyRequests();

  const user = await repo.findUserByEmail(db, input.email);
  const passwordOk = await verifyPassword(user?.passwordHash, input.password);
  const household = user && passwordOk ? await repo.findMembership(db, user.id) : undefined;
  if (!user || !household) {
    loginLimiter.recordFailure(limiterKey);
    // Одна відповідь для невідомого email і невірного пароля.
    throw unauthorized('Невірний email або пароль');
  }

  loginLimiter.reset(limiterKey);
  return { ...toCurrentUser(user, household), ...(await issueTokens(db, tokens, user.id)) };
}

/** Видає нову пару токенів і відкликає використаний refresh-токен. */
export async function refresh({ db, tokens }: AuthDeps, refreshToken: string): Promise<AuthTokens> {
  const issued = await db.transaction(async (tx) => {
    const now = new Date();
    const row = await repo.findRefreshTokenForUpdate(tx, hashRefreshToken(refreshToken));
    if (!row) return undefined;
    if (row.revokedAt) {
      // Токен уже використано: його могли вкрасти, тому завершуємо всі сесії цього входу.
      await repo.revokeFamily(tx, row.familyId, now);
      return undefined;
    }
    if (row.expiresAt <= now) return undefined;

    await repo.revokeRefreshToken(tx, row.id, now);
    return issueTokens(tx, tokens, row.userId, row.familyId);
  });
  if (!issued) throw unauthorized();
  return issued;
}

export async function logout({ db }: AuthDeps, refreshToken: string): Promise<void> {
  const row = await repo.findRefreshToken(db, hashRefreshToken(refreshToken));
  if (row) await repo.revokeFamily(db, row.familyId, new Date());
}

export async function getCurrentUser({ db }: AuthDeps, auth: AuthContext): Promise<CurrentUser> {
  const [user, household] = await Promise.all([
    repo.findUserById(db, auth.userId),
    repo.findMembership(db, auth.userId),
  ]);
  if (!user || !household) throw unauthorized();
  return toCurrentUser(user, household);
}
