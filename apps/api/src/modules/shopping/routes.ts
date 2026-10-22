import { createProductSchema, idParamsSchema, updateProductSchema } from '@hf/shared';
import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as service from './service.ts';

export function productsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await service.listProducts(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = createProductSchema.parse(req.body);
    res.status(201).json(await service.createProduct(db, getAuth(res), input));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.getProduct(db, getAuth(res), id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateProductSchema.parse(req.body);
    res.json(await service.updateProduct(db, getAuth(res), id, input));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteProduct(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}
