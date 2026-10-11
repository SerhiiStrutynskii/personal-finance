import cors from 'cors';
import express, { Router } from 'express';
import type { Db } from './db/client.ts';
import { devAuth, type DevAuthOptions } from './http/auth.ts';
import { errorHandler, notFoundHandler } from './http/error-handler.ts';
import { accountsRouter } from './modules/accounts/routes.ts';
import { categoriesRouter } from './modules/categories/routes.ts';
import { transactionsRouter } from './modules/transactions/routes.ts';

export interface AppOptions {
  db: Db;
  corsOrigin: string;
  devAuth: DevAuthOptions;
}

export function createApp({ db, corsOrigin, devAuth: devAuthOptions }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = Router();
  api.use(devAuth(db, devAuthOptions));
  api.use('/accounts', accountsRouter(db));
  api.use('/categories', categoriesRouter(db));
  api.use('/transactions', transactionsRouter(db));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
