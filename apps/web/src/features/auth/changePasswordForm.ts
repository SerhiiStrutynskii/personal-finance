import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  changePasswordSchema,
  type ChangePasswordInput,
} from '@hf/shared';
import { ApiError } from '../../shared/api/client.ts';

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  /** Повтор нового пароля; перевіряється лише тут і на сервер не надсилається. */
  confirmPassword: string;
}

/** Помилки під полями; `form` — загальна помилка над кнопками. */
export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordValues | 'form', string>>;

export const emptyChangePasswordValues: ChangePasswordValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export const NEW_PASSWORD_HINT = `Від ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символів`;
const NEW_PASSWORD_LENGTH_ERROR = `Пароль має містити від ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символів`;
const CURRENT_PASSWORD_REQUIRED = 'Введіть поточний пароль';
const SAME_PASSWORD = 'Новий пароль має відрізнятися від поточного';
const CONFIRM_MISMATCH = 'Паролі не збігаються';
export const TOO_MANY_ATTEMPTS = 'Забагато спроб. Спробуйте пізніше';
export const CURRENT_PASSWORD_INVALID = 'Поточний пароль невірний';
export const PASSWORD_CHANGED_MESSAGE =
  'Пароль змінено. Інші пристрої вийдуть із системи протягом 15 хвилин';

export type ChangePasswordValidation =
  { ok: true; input: ChangePasswordInput } | { ok: false; errors: ChangePasswordErrors };

/**
 * Перевіряє форму до запиту: ті самі правила, що й на сервері (спільна схема), плюс збіг
 * повтору. Якщо є помилка — запит не надсилається.
 */
export function validateChangePassword(values: ChangePasswordValues): ChangePasswordValidation {
  const errors: ChangePasswordErrors = {};
  const parsed = changePasswordSchema.safeParse({
    currentPassword: values.currentPassword,
    newPassword: values.newPassword,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'currentPassword') errors.currentPassword ??= CURRENT_PASSWORD_REQUIRED;
      if (field === 'newPassword') {
        // Збіг із поточним має власне повідомлення зі схеми; інші помилки — про довжину.
        errors.newPassword ??= issue.code === 'custom' ? SAME_PASSWORD : NEW_PASSWORD_LENGTH_ERROR;
      }
    }
  }
  if (values.confirmPassword !== values.newPassword) errors.confirmPassword = CONFIRM_MISMATCH;

  if (parsed.success && Object.keys(errors).length === 0) return { ok: true, input: parsed.data };
  return { ok: false, errors };
}

/** Помилка сервера → де її показати у формі. */
export function changePasswordErrorsFromServer(error: unknown): ChangePasswordErrors {
  if (error instanceof ApiError) {
    if (error.code === 'CURRENT_PASSWORD_INVALID') {
      return { currentPassword: CURRENT_PASSWORD_INVALID };
    }
    if (error.status === 429) return { form: TOO_MANY_ATTEMPTS };
    if (error.code === 'VALIDATION_ERROR') {
      const errors: ChangePasswordErrors = {};
      // Повідомлення zod за замовчуванням не локалізовані — показуємо власні.
      for (const issue of error.issues) {
        if (issue.path === 'currentPassword') errors.currentPassword ??= CURRENT_PASSWORD_REQUIRED;
        if (issue.path === 'newPassword') {
          errors.newPassword ??=
            issue.message === SAME_PASSWORD ? SAME_PASSWORD : NEW_PASSWORD_LENGTH_ERROR;
        }
      }
      if (Object.keys(errors).length > 0) return errors;
    }
    return { form: error.message };
  }
  return { form: error instanceof Error ? error.message : 'Сталася помилка. Спробуйте ще раз' };
}
