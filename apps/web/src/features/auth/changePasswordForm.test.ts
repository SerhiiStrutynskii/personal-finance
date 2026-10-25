import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../../shared/api/client.ts';
import {
  CURRENT_PASSWORD_INVALID,
  TOO_MANY_ATTEMPTS,
  changePasswordErrorsFromServer,
  emptyChangePasswordValues,
  validateChangePassword,
  type ChangePasswordValues,
} from './changePasswordForm.ts';

const valid: ChangePasswordValues = {
  currentPassword: 'old-password',
  newPassword: 'new-password-1',
  confirmPassword: 'new-password-1',
};
const withNew = (newPassword: string, confirmPassword = newPassword) => ({
  ...valid,
  newPassword,
  confirmPassword,
});

describe('validateChangePassword', () => {
  it('повертає дані для запиту без повтору пароля', () => {
    expect(validateChangePassword(valid)).toEqual({
      ok: true,
      input: { currentPassword: 'old-password', newPassword: 'new-password-1' },
    });
  });

  it('межі довжини нового пароля: 10 і 128 — так, 9 і 129 — ні', () => {
    expect(validateChangePassword(withNew('x'.repeat(10))).ok).toBe(true);
    expect(validateChangePassword(withNew('x'.repeat(128))).ok).toBe(true);
    for (const password of ['x'.repeat(9), 'x'.repeat(129)]) {
      expect(validateChangePassword(withNew(password))).toEqual({
        ok: false,
        errors: { newPassword: 'Пароль має містити від 10 до 128 символів' },
      });
    }
  });

  it('повтор, що не збігається, — помилка під повтором', () => {
    expect(validateChangePassword(withNew('new-password-1', 'new-password-2'))).toEqual({
      ok: false,
      errors: { confirmPassword: 'Паролі не збігаються' },
    });
  });

  it('порожня форма — помилки під усіма полями, що їх потребують', () => {
    const result = validateChangePassword(emptyChangePasswordValues);
    expect(result).toEqual({
      ok: false,
      errors: {
        currentPassword: 'Введіть поточний пароль',
        newPassword: 'Пароль має містити від 10 до 128 символів',
      },
    });
  });

  it('новий пароль, що збігається з поточним, — окреме повідомлення', () => {
    expect(validateChangePassword(withNew('old-password-1', 'old-password-1'))).toMatchObject({
      ok: true,
    });
    expect(
      validateChangePassword({
        currentPassword: 'same-password',
        newPassword: 'same-password',
        confirmPassword: 'same-password',
      }),
    ).toEqual({
      ok: false,
      errors: { newPassword: 'Новий пароль має відрізнятися від поточного' },
    });
  });

  it('помилки не містять значень паролів', () => {
    const values = withNew('short', 'other');
    const result = validateChangePassword(values);
    expect(JSON.stringify(result)).not.toContain('short');
    expect(JSON.stringify(result)).not.toContain('other');
  });
});

describe('changePasswordErrorsFromServer', () => {
  it('невірний поточний пароль — під полем поточного пароля', () => {
    const error = new ApiError(422, 'CURRENT_PASSWORD_INVALID', 'Поточний пароль невірний');
    expect(changePasswordErrorsFromServer(error)).toEqual({
      currentPassword: CURRENT_PASSWORD_INVALID,
    });
  });

  it('429 — загальне повідомлення', () => {
    const error = new ApiError(429, 'TOO_MANY_REQUESTS', 'Забагато спроб. Спробуйте пізніше');
    expect(changePasswordErrorsFromServer(error)).toEqual({ form: TOO_MANY_ATTEMPTS });
  });

  it('помилки валідації сервера — під полями, з власними текстами', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Некоректні дані', [
      { path: 'newPassword', message: 'Too small' },
    ]);
    expect(changePasswordErrorsFromServer(error)).toEqual({
      newPassword: 'Пароль має містити від 10 до 128 символів',
    });
  });

  it('інші помилки — загальне повідомлення', () => {
    expect(changePasswordErrorsFromServer(new NetworkError())).toEqual({
      form: 'Немає звʼязку із сервером',
    });
    expect(
      changePasswordErrorsFromServer(new ApiError(500, 'INTERNAL', 'Сталася помилка')),
    ).toEqual({ form: 'Сталася помилка' });
  });
});
