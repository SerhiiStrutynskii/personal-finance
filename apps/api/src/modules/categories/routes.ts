import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import { createCategorySchema, idParamsSchema, updateCategorySchema } from './schema.ts';
import * as service from './service.ts';

export function categoriesRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await service.listCategories(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = createCategorySchema.parse(req.body);
    res.status(201).json(await service.createCategory(db, getAuth(res), input));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.getCategory(db, getAuth(res), id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateCategorySchema.parse(req.body);
    res.json(await service.updateCategory(db, getAuth(res), id, input));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteCategory(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}
