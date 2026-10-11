import { asc, eq } from 'drizzle-orm';
import type { RequestHandler, Response } from 'express';
import { idSchema } from '@hf/shared';
import type { Db } from '../db/client.ts';
import { householdMembers } from '../db/schema.ts';
import { unauthorized } from './errors.ts';

/** Хто робить запит і в межах якого домогосподарства. Передається в кожну функцію сервісів. */
export interface AuthContext {
  userId: string;
  householdId: string;
}

export interface DevAuthOptions {
  enabled: boolean;
  defaultUserId?: string | undefined;
}

export const DEV_USER_HEADER = 'x-dev-user-id';

/**
 * Тимчасова заміна авторизації до появи справжньої (етап 4): користувач береться із заголовка
 * X-Dev-User-Id або з DEV_USER_ID. Поза development/test завжди відповідає 401.
 */
export function devAuth(db: Db, options: DevAuthOptions): RequestHandler {
  return async (req, res, next) => {
    if (!options.enabled) throw unauthorized();

    const parsed = idSchema.safeParse(req.get(DEV_USER_HEADER) ?? options.defaultUserId);
    if (!parsed.success) throw unauthorized();

    const [membership] = await db
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, parsed.data))
      .orderBy(asc(householdMembers.createdAt))
      .limit(1);
    if (!membership) throw unauthorized();

    const auth: AuthContext = { userId: parsed.data, householdId: membership.householdId };
    res.locals.auth = auth;
    next();
  };
}

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;
  if (!auth) throw unauthorized();
  return auth;
}
