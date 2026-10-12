import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import { createDebtSchema, debtsQuerySchema, idParamsSchema, updateDebtSchema } from './schema.ts';
import * as service from './service.ts';

export function debtsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { month } = debtsQuerySchema.parse(req.query);
    res.json(await service.getOverview(db, getAuth(res), month, now()));
  });

  router.post('/', async (req, res) => {
    const input = createDebtSchema.parse(req.body);
    res.status(201).json(await service.createDebt(db, getAuth(res), input, now()));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const { month } = debtsQuerySchema.parse(req.query);
    res.json(await service.getDebt(db, getAuth(res), id, month, now()));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateDebtSchema.parse(req.body);
    res.json(await service.updateDebt(db, getAuth(res), id, input, now()));
  });

  router.post('/:id/close', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.closeDebt(db, getAuth(res), id, now()));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteDebt(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}
