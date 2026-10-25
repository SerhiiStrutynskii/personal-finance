import {
  createDishSchema,
  createMealTypeSchema,
  createMenuEntrySchema,
  createMenuShoppingListSchema,
  idParamsSchema,
  menuPeriodQuerySchema,
  menuShoppingQuerySchema,
  reorderMealTypesSchema,
  updateDishSchema,
  updateMealTypeSchema,
  updateMenuEntrySchema,
} from '@hf/shared';
import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as dishes from './dishes.service.ts';
import * as entries from './entries.service.ts';
import * as mealTypes from './mealTypes.service.ts';
import * as shopping from './shopping.service.ts';

export function mealTypesRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await mealTypes.listMealTypes(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = createMealTypeSchema.parse(req.body);
    res.status(201).json(await mealTypes.createMealType(db, getAuth(res), input));
  });

  // До /:id, щоб «order» не розбирався як id.
  router.put('/order', async (req, res) => {
    const input = reorderMealTypesSchema.parse(req.body);
    res.json({ items: await mealTypes.reorderMealTypes(db, getAuth(res), input) });
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateMealTypeSchema.parse(req.body);
    res.json(await mealTypes.renameMealType(db, getAuth(res), id, input));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await mealTypes.deleteMealType(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}

export function dishesRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ items: await dishes.listDishes(db, getAuth(res)) });
  });

  router.post('/', async (req, res) => {
    const input = createDishSchema.parse(req.body);
    res.status(201).json(await dishes.createDish(db, getAuth(res), input));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await dishes.getDish(db, getAuth(res), id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateDishSchema.parse(req.body);
    res.json(await dishes.updateDish(db, getAuth(res), id, input));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await dishes.deleteDish(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}

/** Календар меню: період [from, to) і записи «страва в прийомі їжі дня». */
export function menuRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = menuPeriodQuerySchema.parse(req.query);
    res.json(await entries.getMenuPeriod(db, getAuth(res), query));
  });

  router.post('/entries', async (req, res) => {
    const input = createMenuEntrySchema.parse(req.body);
    const { entry, created } = await entries.createEntry(db, getAuth(res), input);
    res.status(created ? 201 : 200).json(entry);
  });

  router.patch('/entries/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateMenuEntrySchema.parse(req.body);
    res.json(await entries.updateEntry(db, getAuth(res), id, input));
  });

  router.delete('/entries/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await entries.deleteEntry(db, getAuth(res), id);
    res.status(204).end();
  });

  // Покупки за меню: перелік продуктів і бюджет періоду; звичайний список покупок з переліку.
  router.get('/shopping', async (req, res) => {
    const query = menuShoppingQuerySchema.parse(req.query);
    res.json(await shopping.getMenuShopping(db, getAuth(res), query));
  });

  router.post('/shopping-list', async (req, res) => {
    const input = createMenuShoppingListSchema.parse(req.body);
    res.status(201).json(await shopping.createShoppingListFromMenu(db, getAuth(res), input));
  });

  return router;
}
