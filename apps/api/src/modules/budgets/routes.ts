import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import {
  budgetLineParamsSchema,
  budgetQuerySchema,
  createBudgetSchema,
  createExpenseLineSchema,
  createIncomeLineSchema,
  idParamsSchema,
  updateBudgetSchema,
  updateExpenseLineSchema,
  updateIncomeLineSchema,
} from './schema.ts';
import * as service from './service.ts';

// Кожна відповідь, що змінює бюджет, повертає його цілком із перерахованими підсумками.
export function budgetsRouter(db: Db): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { month } = budgetQuerySchema.parse(req.query);
    res.json(await service.getBudgetByMonth(db, getAuth(res), month));
  });

  router.post('/', async (req, res) => {
    const input = createBudgetSchema.parse(req.body);
    res.status(201).json(await service.createBudget(db, getAuth(res), input));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const { status } = updateBudgetSchema.parse(req.body);
    res.json(await service.updateBudgetStatus(db, getAuth(res), id, status));
  });

  router.post('/:id/income-lines', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = createIncomeLineSchema.parse(req.body);
    res.status(201).json(await service.addIncomeLine(db, getAuth(res), id, input));
  });

  router.patch('/:id/income-lines/:lineId', async (req, res) => {
    const { id, lineId } = budgetLineParamsSchema.parse(req.params);
    const input = updateIncomeLineSchema.parse(req.body);
    res.json(await service.updateIncomeLine(db, getAuth(res), id, lineId, input));
  });

  router.delete('/:id/income-lines/:lineId', async (req, res) => {
    const { id, lineId } = budgetLineParamsSchema.parse(req.params);
    res.json(await service.deleteIncomeLine(db, getAuth(res), id, lineId));
  });

  router.post('/:id/expense-lines', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = createExpenseLineSchema.parse(req.body);
    res.status(201).json(await service.addExpenseLine(db, getAuth(res), id, input));
  });

  router.patch('/:id/expense-lines/:lineId', async (req, res) => {
    const { id, lineId } = budgetLineParamsSchema.parse(req.params);
    const input = updateExpenseLineSchema.parse(req.body);
    res.json(await service.updateExpenseLine(db, getAuth(res), id, lineId, input));
  });

  router.delete('/:id/expense-lines/:lineId', async (req, res) => {
    const { id, lineId } = budgetLineParamsSchema.parse(req.params);
    res.json(await service.deleteExpenseLine(db, getAuth(res), id, lineId));
  });

  return router;
}
