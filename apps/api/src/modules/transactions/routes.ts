import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import {
  exportExpensesQuerySchema,
  idParamsSchema,
  listTransactionsQuerySchema,
  transactionInputSchema,
} from './schema.ts';
import * as service from './service.ts';

export function transactionsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listTransactionsQuerySchema.parse(req.query);
    res.json(await service.listTransactions(db, getAuth(res), query));
  });

  router.post('/', async (req, res) => {
    const input = transactionInputSchema.parse(req.body);
    res.status(201).json(await service.createTransaction(db, getAuth(res), input, now()));
  });

  // До GET /:id, інакше «export.csv» розбиралося б як id.
  router.get('/export.csv', async (req, res) => {
    const query = exportExpensesQuerySchema.parse(req.query);
    const { filename, body } = await service.exportExpensesCsv(db, getAuth(res), query);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      })
      .send(body);
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.getTransaction(db, getAuth(res), id));
  });

  router.put('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = transactionInputSchema.parse(req.body);
    res.json(await service.replaceTransaction(db, getAuth(res), id, input, now()));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteTransaction(db, getAuth(res), id);
    res.status(204).end();
  });

  return router;
}
