import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import {
  budgetLineParamsSchema,
  budgetQuerySchema,
  createBudgetSchema,
  createExpenseLineSchema,
  idParamsSchema,
  updateExpenseLineSchema,
} from './schema.ts';
import * as service from './service.ts';

// Кожна відповідь, що змінює бюджет, повертає його цілком із перерахованими підсумками.
export function budgetsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { month } = budgetQuerySchema.parse(req.query);
    res.json(await service.getBudgetByMonth(db, getAuth(res), month, now()));
  });

  router.post('/', async (req, res) => {
    const input = createBudgetSchema.parse(req.body);
    res.status(201).json(await service.createBudget(db, getAuth(res), input, now()));
  });

  router.post('/:id/expense-lines', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = createExpenseLineSchema.parse(req.body);
    res.status(201).json(await service.addExpenseLine(db, getAuth(res), id, input, now()));
  });

  router.patch('/:id/expense-lines/:lineId', async (req, res) => {
    const { id, lineId } = budgetLineParamsSchema.parse(req.params);
    const input = updateExpenseLineSchema.parse(req.body);
    res.json(await service.updateExpenseLine(db, getAuth(res), id, lineId, input, now()));
  });

  router.delete('/:id/expense-lines/:lineId', async (req, res) => {
    const { id, lineId } = budgetLineParamsSchema.parse(req.params);
    res.json(await service.deleteExpenseLine(db, getAuth(res), id, lineId, now()));
  });

  return router;
}
