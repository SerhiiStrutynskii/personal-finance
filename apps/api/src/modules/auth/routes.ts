import { Router } from 'express';
import { getAuth, requireAuth } from '../../http/auth.ts';
import { registrationClosed } from '../../http/errors.ts';
import { previewInvite } from '../household/service.ts';
import {
  changePasswordSchema,
  inviteTokenParamsSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from './schema.ts';
import * as service from './service.ts';

export function authRouter(deps: service.AuthDeps): Router {
  const router = Router();

  // Відкрите налаштування для екрана входу: чи показувати реєстрацію.
  router.get('/config', (_req, res) => {
    res.json({ registrationEnabled: deps.registrationEnabled });
  });

  // Відкриті дані запрошення для сторінки реєстрації за посиланням.
  router.get('/invites/:token', async (req, res) => {
    const { token } = inviteTokenParamsSchema.parse(req.params);
    res.json(await previewInvite(deps.db, token, deps.now()));
  });

  router.post('/register', async (req, res) => {
    // Закрита реєстрація не стосується запрошень: так власник додає родину. Перевіряється до
    // розбору тіла, щоб відмова не залежала від коректності решти даних.
    const inviteToken: unknown = req.body?.inviteToken;
    if (!deps.registrationEnabled && !(typeof inviteToken === 'string' && inviteToken)) {
      throw registrationClosed();
    }
    const input = registerSchema.parse(req.body);
    res.status(201).json(await service.register(deps, input));
  });

  router.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    res.json(await service.login(deps, input, req.ip ?? 'unknown'));
  });

  router.post('/refresh', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await service.refresh(deps, refreshToken));
  });

  router.post('/logout', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await service.logout(deps, refreshToken);
    res.status(204).end();
  });

  router.get('/me', requireAuth(deps.db, deps.tokens), async (_req, res) => {
    res.json(await service.getCurrentUser(deps, getAuth(res)));
  });

  // Лише власний пароль: id користувача береться з access-токена, а не з тіла.
  router.post('/password', requireAuth(deps.db, deps.tokens), async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    res.json(await service.changePassword(deps, getAuth(res), input));
  });

  return router;
}
