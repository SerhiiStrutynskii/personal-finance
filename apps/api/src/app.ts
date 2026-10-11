import cors from 'cors';
import express, { Router } from 'express';
import type { Db } from './db/client.ts';
import { requireAuth } from './http/auth.ts';
import { errorHandler, notFoundHandler } from './http/error-handler.ts';
import { accountsRouter } from './modules/accounts/routes.ts';
import { createLoginLimiter, type RateLimiter } from './modules/auth/rate-limiter.ts';
import { authRouter } from './modules/auth/routes.ts';
import { createTokenService } from './modules/auth/tokens.ts';
import { budgetsRouter } from './modules/budgets/routes.ts';
import { incomeSourcesRouter } from './modules/incomes/routes.ts';
import { categoriesRouter } from './modules/categories/routes.ts';
import { transactionsRouter } from './modules/transactions/routes.ts';

export interface AppOptions {
  db: Db;
  corsOrigin: string;
  jwtSecret: string;
  loginLimiter?: RateLimiter;
}

export function createApp({ db, corsOrigin, jwtSecret, loginLimiter }: AppOptions) {
  const tokens = createTokenService(jwtSecret);

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/api/auth',
    authRouter({ db, tokens, loginLimiter: loginLimiter ?? createLoginLimiter() }),
  );

  const api = Router();
  api.use(requireAuth(db, tokens));
  api.use('/accounts', accountsRouter(db));
  api.use('/budgets', budgetsRouter(db));
  api.use('/categories', categoriesRouter(db));
  api.use('/income-sources', incomeSourcesRouter(db));
  api.use('/transactions', transactionsRouter(db));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
