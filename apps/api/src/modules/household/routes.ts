import { idParamsSchema, idSchema, updateHouseholdSchema } from '@hf/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db/client.ts';
import { getAuth } from '../../http/auth.ts';
import * as service from './service.ts';

const memberParamsSchema = z.object({ userId: idSchema });

export function householdRouter(db: Db, now: () => Date): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.getHousehold(db, getAuth(res), now()));
  });

  router.patch('/', async (req, res) => {
    const input = updateHouseholdSchema.parse(req.body);
    res.json(await service.updateHousehold(db, getAuth(res), input, now()));
  });

  router.post('/invites', async (_req, res) => {
    res.status(201).json(await service.createInvite(db, getAuth(res), now()));
  });

  router.delete('/invites/:id', async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.revokeInvite(db, getAuth(res), id, now());
    res.status(204).end();
  });

  router.delete('/members/:userId', async (req, res) => {
    const { userId } = memberParamsSchema.parse(req.params);
    await service.removeMember(db, getAuth(res), userId);
    res.status(204).end();
  });

  router.post('/leave', async (_req, res) => {
    await service.leaveHousehold(db, getAuth(res));
    res.status(204).end();
  });

  return router;
}
