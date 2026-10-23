import { z } from 'zod';

export { loginSchema, refreshSchema, registerSchema } from '@hf/shared';

export const inviteTokenParamsSchema = z.object({ token: z.string().min(1).max(200) });
export type {
  AuthSession,
  AuthTokens,
  CurrentUser,
  LoginInput,
  RefreshInput,
  RegisterInput,
} from '@hf/shared';
