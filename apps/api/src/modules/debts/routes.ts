import { Router } from 'express';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as movements from './movements.service.ts';
import {
  cardPaymentSchema,
  createDebtSchema,
  debtAdjustmentSchema,
  debtChargeSchema,
  debtEntryParamsSchema,
  debtPaymentSchema,
  debtsQuerySchema,
  idParamsSchema,
  paymentPreviewQuerySchema,
  updateDebtSchema,
} from './schema.ts';
import * as service from './service.ts';

export function debtsRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { month } = debtsQuerySchema.parse(req.query);
    res.json(await service.getOverview(db, getAuth(res), month, now()));
  });

  router.post('/', async (req, res) => {
    const input = createDebtSchema.parse(req.body);
    res.status(201).json(await service.createDebt(db, getAuth(res), input, now()));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const { month } = debtsQuerySchema.parse(req.query);
    res.json(await service.getDebt(db, getAuth(res), id, month, now()));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateDebtSchema.parse(req.body);
    res.json(await service.updateDebt(db, getAuth(res), id, input, now()));
  });

  router.post('/:id/close', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    res.json(await service.closeDebt(db, getAuth(res), id, now()));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.deleteDebt(db, getAuth(res), id);
    res.status(204).end();
  });

  // --- Рухи позик і розстрочок ---

  router.post('/:id/payments', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = debtPaymentSchema.parse(req.body);
    res.status(201).json(await movements.addPayment(db, getAuth(res), id, input, now()));
  });

  router.post('/:id/charges', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = debtChargeSchema.parse(req.body);
    res.status(201).json(await movements.addCharge(db, getAuth(res), id, input, now()));
  });

  router.delete('/:id/entries/:entryId', async (req, res) => {
    const { id, entryId } = debtEntryParamsSchema.parse(req.params);
    await movements.deleteEntry(db, getAuth(res), id, entryId, now());
    res.status(204).end();
  });

  router.get('/:id/payment-preview', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const { amount } = paymentPreviewQuerySchema.parse(req.query);
    res.json(await movements.previewPayment(db, getAuth(res), id, amount, now()));
  });

  // --- Рухи кредиток ---

  router.post('/:id/card-payments', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = cardPaymentSchema.parse(req.body);
    res.status(201).json(await movements.addCardPayment(db, getAuth(res), id, input, now()));
  });

  router.post('/:id/card-fees', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = debtChargeSchema.parse(req.body);
    res.status(201).json(await movements.addCardFee(db, getAuth(res), id, input, now()));
  });

  // --- Обидва типи ---

  router.post('/:id/adjustments', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = debtAdjustmentSchema.parse(req.body);
    res.status(201).json(await movements.addAdjustment(db, getAuth(res), id, input, now()));
  });

  return router;
}
