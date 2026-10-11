import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import { createAccountSchema, idParamsSchema, updateAccountSchema } from './schema.ts';
import * as service from './service.ts';

export function accountsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await service.listAccounts(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = createAccountSchema.parse(req.body);
    res.status(201).json(await service.createAccount(db, getAuth(res), input));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.getAccount(db, getAuth(res), id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateAccountSchema.parse(req.body);
    res.json(await service.updateAccount(db, getAuth(res), id, input));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteAccount(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}
