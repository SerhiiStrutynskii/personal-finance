import { describe, expect, it } from 'vitest';
import {
  PASSWORD_CHANGE_MAX_FAILURES,
  PASSWORD_CHANGE_WINDOW_MS,
  createPasswordChangeLimiter,
  createRateLimiter,
} from '../rate-limiter.ts';

describe('createRateLimiter', () => {
  function setup() {
    const clock = { now: 1_000_000 };
    const limiter = createRateLimiter({ max: 3, windowMs: 1000, now: () => clock.now });
    return { clock, limiter };
  }

  it('блокує після max невдач, але не раніше', () => {
    const { limiter } = setup();
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);
  });

  it('рахує ключі незалежно', () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure('a');
    expect(limiter.isBlocked('b')).toBe(false);
  });

  it('знімає блокування, коли вікно минуло; вікно відлічується від першої невдачі', () => {
    const { clock, limiter } = setup();
    limiter.recordFailure('a');
    clock.now += 900;
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);

    clock.now += 99;
    expect(limiter.isBlocked('a')).toBe(true);
    clock.now += 1;
    expect(limiter.isBlocked('a')).toBe(false);

    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('reset очищає лічильник', () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure('a');
    limiter.reset('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });
});

describe('createPasswordChangeLimiter', () => {
  it(`блокує після ${PASSWORD_CHANGE_MAX_FAILURES} невдач на 15 хвилин`, () => {
    const clock = { now: 1_000_000 };
    const limiter = createPasswordChangeLimiter(() => clock.now);
    for (let i = 0; i < PASSWORD_CHANGE_MAX_FAILURES - 1; i++) limiter.recordFailure('user');
    expect(limiter.isBlocked('user')).toBe(false);
    limiter.recordFailure('user');
    expect(limiter.isBlocked('user')).toBe(true);

    clock.now += PASSWORD_CHANGE_WINDOW_MS - 1;
    expect(limiter.isBlocked('user')).toBe(true);
    clock.now += 1;
    expect(limiter.isBlocked('user')).toBe(false);
  });
});
