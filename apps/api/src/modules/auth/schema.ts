import { z } from 'zod';

export { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from '@hf/shared';

export const inviteTokenParamsSchema = z.object({ token: z.string().min(1).max(200) });
export type {
  AuthSession,
  AuthTokens,
  ChangePasswordInput,
  CurrentUser,
  LoginInput,
  RefreshInput,
  RegisterInput,
} from '@hf/shared';
