import { Router } from 'express';
import { getAuth, requireAuth } from '../../http/auth.ts';
import { registrationClosed } from '../../http/errors.ts';
import { loginSchema, refreshSchema, registerSchema } from './schema.ts';
import * as service from './service.ts';

export function authRouter(deps: service.AuthDeps): Router {
  const router = Router();

  // Відкрите налаштування для екрана входу: чи показувати реєстрацію.
  router.get('/config', (_req, res) => {
    res.json({ registrationEnabled: deps.registrationEnabled });
  });

  router.post('/register', async (req, res) => {
    if (!deps.registrationEnabled) throw registrationClosed();
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

  return router;
}
