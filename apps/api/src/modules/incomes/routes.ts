import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import { idParamsSchema, incomeSourceInputSchema, updateIncomeSourceSchema } from './schema.ts';
import * as sources from './sources.service.ts';

export function incomeSourcesRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await sources.listSources(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = incomeSourceInputSchema.parse(req.body);
    res.status(201).json(await sources.createSource(db, getAuth(res), input));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const patch = updateIncomeSourceSchema.parse(req.body);
    res.json(await sources.updateSource(db, getAuth(res), id, patch));
  });

  router.post('/:id/deactivate', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await sources.deactivateSource(db, getAuth(res), id));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await sources.deleteSource(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}
