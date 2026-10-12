import {
  createGoalSchema,
  goalContributionSchema,
  idParamsSchema,
  payoffPlanQuerySchema,
  updateGoalSchema,
} from '@hf/shared';
import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as service from './service.ts';

export function goalsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.listGoals(db, getAuth(res), now()));
  });

  router.post('/', async (req, res) => {
    const input = createGoalSchema.parse(req.body);
    res.status(201).json(await service.createGoal(db, getAuth(res), input, now()));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.getGoal(db, getAuth(res), id, now()));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateGoalSchema.parse(req.body);
    res.json(await service.updateGoal(db, getAuth(res), id, input, now()));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteGoal(db, getAuth(res), id);
    res.status(204).end();
  });

  router.post('/:id/archive', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.archiveGoal(db, getAuth(res), id, now()));
  });

  router.post('/:id/contributions', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = goalContributionSchema.parse(req.body);
    res.status(201).json(await service.contribute(db, getAuth(res), id, input, now()));
  });

  router.get('/:id/payoff-plan', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const options = payoffPlanQuerySchema.parse(req.query);
    res.json(await service.getPayoffPlan(db, getAuth(res), id, options, now()));
  });

  return router;
}
