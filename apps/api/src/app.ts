import cors from 'cors';
import express, { Router } from 'express';
import type { Db } from './db/client.ts';
import { requireAuth } from './http/auth.ts';
import { errorHandler, notFoundHandler } from './http/error-handler.ts';
import { accountsRouter } from './modules/accounts/routes.ts';
import { analyticsRouter } from './modules/analytics/routes.ts';
import { createLoginLimiter, type RateLimiter } from './modules/auth/rate-limiter.ts';
import { authRouter } from './modules/auth/routes.ts';
import { createTokenService } from './modules/auth/tokens.ts';
import { budgetsRouter } from './modules/budgets/routes.ts';
import { dashboardRouter } from './modules/dashboard/routes.ts';
import { debtsRouter } from './modules/debts/routes.ts';
import { goalsRouter } from './modules/goals/routes.ts';
import {
  incomeOccurrencesRouter,
  incomeSourcesRouter,
  incomesRouter,
} from './modules/incomes/routes.ts';
import { categoriesRouter } from './modules/categories/routes.ts';
import { productsRouter } from './modules/shopping/routes.ts';
import { transactionsRouter } from './modules/transactions/routes.ts';

export interface AppOptions {
  db: Db;
  corsOrigin: string;
  jwtSecret: string;
  loginLimiter?: RateLimiter;
  /** Поточний момент; підміняється в тестах, щоб перевіряти правила про періоди. */
  now?: () => Date;
  /** false закриває реєстрацію нових користувачів. */
  registrationEnabled?: boolean;
  /** Каталог зі зібраним фронтендом, який API роздає з того самого домену. */
  webDistDir?: string | undefined;
  /** Кількість проксі перед застосунком — щоб req.ip був адресою клієнта. */
  trustProxy?: number;
}

export function createApp({
  db,
  corsOrigin,
  jwtSecret,
  loginLimiter,
  now = () => new Date(),
  registrationEnabled = true,
  webDistDir,
  trustProxy = 0,
}: AppOptions) {
  const tokens = createTokenService(jwtSecret);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(
    '/api/auth',
    authRouter({
      db,
      tokens,
      loginLimiter: loginLimiter ?? createLoginLimiter(),
      registrationEnabled,
    }),
  );

  const api = Router();
  api.use(requireAuth(db, tokens));
  api.use('/accounts', accountsRouter(db, now));
  api.use('/analytics', analyticsRouter(db, now));
  api.use('/budgets', budgetsRouter(db, now));
  api.use('/categories', categoriesRouter(db));
  api.use('/dashboard', dashboardRouter(db, now));
  api.use('/debts', debtsRouter(db, now));
  api.use('/goals', goalsRouter(db, now));
  api.use('/income-occurrences', incomeOccurrencesRouter(db, now));
  api.use('/income-sources', incomeSourcesRouter(db, now));
  api.use('/incomes', incomesRouter(db, now));
  api.use('/products', productsRouter(db));
  api.use('/transactions', transactionsRouter(db, now));
  app.use('/api', api);

  if (webDistDir) {
    // Статичні файли фронтенду; будь-який інший маршрут поза /api — це сторінка застосунку,
    // тож віддається index.html, а далі маршрут розбирає клієнт.
    app.use(express.static(webDistDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api(\/|$)|health$).*/, (_req, res) => {
      res.sendFile('index.html', { root: webDistDir, maxAge: 0 });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
