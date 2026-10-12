import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import { getDashboard } from './service.ts';

// Головна лише читає: зведення збирається з інших розділів.
export function dashboardRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await getDashboard(db, getAuth(res), now()));
  });

  return router;
}
