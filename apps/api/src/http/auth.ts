import type { RequestHandler, Response } from 'express';
import type { Db } from '../db/client.ts';
import { findMembership } from '../modules/auth/repo.ts';
import type { TokenService } from '../modules/auth/tokens.ts';
import { unauthorized } from './errors.ts';

/** Хто робить запит і в межах якого домогосподарства. Передається в кожну функцію сервісів. */
export interface AuthContext {
  userId: string;
  householdId: string;
}

const BEARER = /^Bearer (\S+)$/;

/**
 * Перевіряє access-токен із заголовка Authorization. Домогосподарство щоразу береться з БД,
 * а не з токена, тому втрата членства діє одразу.
 */
export function requireAuth(db: Db, tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
    const userId = token && (await tokens.verifyAccessToken(token));
    if (!userId) throw unauthorized();

    const household = await findMembership(db, userId);
    if (!household) throw unauthorized();

    const auth: AuthContext = { userId, householdId: household.id };
    res.locals.auth = auth;
    next();
  };
}

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw unauthorized();
  return auth;
}
