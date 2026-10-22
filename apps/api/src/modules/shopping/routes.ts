import {
  addShoppingListItemSchema,
  createProductSchema,
  createShoppingListSchema,
  idParamsSchema,
  productsQuerySchema,
  shoppingListItemParamsSchema,
  updateProductSchema,
  updateShoppingListItemSchema,
  updateShoppingListSchema,
} from '@hf/shared';
import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as lists from './lists.service.ts';
import * as service from './service.ts';

export function productsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { archived } = productsQuerySchema.parse(req.query);
    res.json({ items: await service.listProducts(db, getAuth(res), archived) });
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

export function shoppingListsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await lists.listLists(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = createShoppingListSchema.parse(req.body);
    res.status(201).json(await lists.createList(db, getAuth(res), input));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await lists.getList(db, getAuth(res), id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateShoppingListSchema.parse(req.body);
    res.json(await lists.renameList(db, getAuth(res), id, input));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await lists.deleteList(db, getAuth(res), id);
    res.status(204).end();
  });

  // Зміни рядків повертають список цілком: разом із ним змінюються підсумки.

  router.post('/:id/items', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = addShoppingListItemSchema.parse(req.body);
    res.status(201).json(await lists.addItem(db, getAuth(res), id, input));
  });

  router.patch('/:id/items/:itemId', async (req, res) => {
    const { id, itemId } = shoppingListItemParamsSchema.parse(req.params);
    const input = updateShoppingListItemSchema.parse(req.body);
    res.json(await lists.updateItem(db, getAuth(res), id, itemId, input, now()));
  });

  router.delete('/:id/items/:itemId', async (req, res) => {
    const { id, itemId } = shoppingListItemParamsSchema.parse(req.params);
    res.json(await lists.deleteItem(db, getAuth(res), id, itemId));
  });

  return router;
}
