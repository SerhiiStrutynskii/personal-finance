import { analyticsMonthQuerySchema, analyticsTrendQuerySchema } from '@hf/shared';
import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as service from './service.ts';

// Аналітика лише читає: усе рахується з транзакцій, бюджетів, доходів і боргів.
export function analyticsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/month', async (req, res) => {
    const { month } = analyticsMonthQuerySchema.parse(req.query);
    res.json(await service.getMonthAnalytics(db, getAuth(res), month, now()));
  });

  router.get('/trend', async (req, res) => {
    const { month, months } = analyticsTrendQuerySchema.parse(req.query);
    res.json(await service.getTrendAnalytics(db, getAuth(res), month, months, now()));
  });

  return router;
}
