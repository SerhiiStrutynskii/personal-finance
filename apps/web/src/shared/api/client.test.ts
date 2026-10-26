import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError, createApiClient, filenameFromDisposition } from './client.ts';
import { createTokenStore } from './tokenStore.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

interface Call {
  method: string;
  path: string;
  search: string;
  authorization: string | undefined;
  body: unknown;
}

type Handler = (call: Call) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauthorized = () =>
  json(401, { error: { code: 'UNAUTHORIZED', message: 'Потрібна авторизація' } });

function setup(handler: Handler, { refreshToken = 'refresh-1', accessToken = 'access-1' } = {}) {
  const storage = memoryStorage(refreshToken ? { 'hf.refreshToken': refreshToken } : {});
  const tokenStore = createTokenStore(storage);
  if (accessToken) tokenStore.setTokens({ accessToken, refreshToken });
  const calls: Call[] = [];

  const fakeFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = init?.headers as Record<string, string>;
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      authorization: headers.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;

  const api = createApiClient({ baseUrl: 'http://api.test', tokenStore, fetch: fakeFetch });
  const refreshCalls = () => calls.filter((call) => call.path === '/api/auth/refresh');
  return { api, tokenStore, storage, calls, refreshCalls };
}

/** Сервер, який приймає лише поточний access-токен і вміє його оновлювати. */
function rotatingServer() {
  let generation = 1;
  const handler: Handler = async (call) => {
    if (call.path === '/api/auth/refresh') {
      await Promise.resolve();
      const { refreshToken } = call.body as { refreshToken: string };
      if (refreshToken !== `refresh-${generation}`) return unauthorized();
      generation += 1;
      return json(200, {
        accessToken: `access-${generation}`,
        refreshToken: `refresh-${generation}`,
        expiresIn: 900,
      });
    }
    if (call.authorization !== `Bearer access-${generation}`) return unauthorized();
    return json(200, { path: call.path });
  };
  return { handler };
}

describe('звичайні запити', () => {
  it('додає токен, параметри запиту і тіло', async () => {
    const { api, calls } = setup(() => json(200, { ok: true }));

    await api.get('/api/transactions', { type: 'expense', limit: 20, from: undefined, to: '' });
    await api.post('/api/accounts', { name: 'Картка' });

    expect(calls[0]).toMatchObject({
      method: 'GET',
      search: '?type=expense&limit=20',
      authorization: 'Bearer access-1',
      body: undefined,
    });
    expect(calls[1]).toMatchObject({ method: 'POST', body: { name: 'Картка' } });
  });

  it('повертає undefined для 204', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    expect(await api.delete('/api/accounts/1')).toBeUndefined();
  });

  it('перетворює помилку API на ApiError', async () => {
    const { api } = setup(() =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Некоректні вхідні дані',
          issues: [{ path: 'amountMinor', message: 'Too small' }],
        },
      }),
    );

    const error = await api.post('/api/transactions', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Некоректні вхідні дані',
      issues: [{ path: 'amountMinor', message: 'Too small' }],
    });
  });

  it('не падає на відповіді без JSON', async () => {
    const { api } = setup(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.get('/api/accounts')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('повідомляє про проблеми з мережею окремою помилкою', async () => {
    const { api, tokenStore } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.get('/api/accounts')).rejects.toBeInstanceOf(NetworkError);
    expect(tokenStore.hasSession()).toBe(true);
  });
});

describe('оновлення токена', () => {
  it('після 401 оновлює токен і повторює запит', async () => {
    const server = rotatingServer();
    const { api, tokenStore, calls, storage } = setup(server.handler, { accessToken: 'stale' });

    expect(await api.get('/api/accounts')).toEqual({ path: '/api/accounts' });
    expect(calls.map((call) => call.path)).toEqual([
      '/api/accounts',
      '/api/auth/refresh',
      '/api/accounts',
    ]);
    expect(calls[2]!.authorization).toBe('Bearer access-2');
    expect(tokenStore.getAccessToken()).toBe('access-2');
    expect(storage.getItem('hf.refreshToken')).toBe('refresh-2');
  });

  it('паралельні запити з простроченим токеном оновлюють його лише раз', async () => {
    const server = rotatingServer();
    const { api, refreshCalls } = setup(server.handler, { accessToken: 'stale' });

    const results = await Promise.all([
      api.get('/api/accounts'),
      api.get('/api/categories'),
      api.get('/api/transactions'),
    ]);

    expect(results).toEqual([
      { path: '/api/accounts' },
      { path: '/api/categories' },
      { path: '/api/transactions' },
    ]);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('запит, чий 401 прийшов після завершеного оновлення, не оновлює токен удруге', async () => {
    const server = rotatingServer();
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
    const { api, refreshCalls } = setup(
      async (call) => {
        if (call.path === '/api/slow' && call.authorization === 'Bearer stale') await slow;
        return server.handler(call);
      },
      { accessToken: 'stale' },
    );

    const slowRequest = api.get('/api/slow');
    await api.get('/api/accounts'); // оновлює токен, поки /api/slow ще в дорозі
    releaseSlow();

    expect(await slowRequest).toEqual({ path: '/api/slow' });
    expect(refreshCalls()).toHaveLength(1);
  });

  it('після перезавантаження сторінки спершу отримує access-токен', async () => {
    const server = rotatingServer();
    const { api, calls } = setup(server.handler, { accessToken: '' });

    await api.get('/api/auth/me');
    expect(calls.map((call) => call.path)).toEqual(['/api/auth/refresh', '/api/auth/me']);
  });

  it('якщо refresh-токен відхилено, завершує сесію', async () => {
    const { api, tokenStore, calls } = setup(() => unauthorized(), { accessToken: 'stale' });

    await expect(api.get('/api/accounts')).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.hasSession()).toBe(false);
    expect(tokenStore.getAccessToken()).toBeUndefined();
    expect(calls).toHaveLength(2); // запит і одна спроба оновлення, без повтору
  });

  it('без refresh-токена не звертається до сервера', async () => {
    const { api, calls } = setup(() => json(200, {}), { refreshToken: '', accessToken: '' });

    await expect(api.get('/api/accounts')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
  });

  it('збій мережі під час оновлення не завершує сесію', async () => {
    const { api, tokenStore } = setup(
      (call) => {
        if (call.path === '/api/auth/refresh') throw new TypeError('Failed to fetch');
        return unauthorized();
      },
      { accessToken: 'stale' },
    );

    await expect(api.get('/api/accounts')).rejects.toBeInstanceOf(NetworkError);
    expect(tokenStore.hasSession()).toBe(true);
  });

  it('помилка сервера під час оновлення не завершує сесію', async () => {
    const { api, tokenStore } = setup(
      (call) => (call.path === '/api/auth/refresh' ? json(500, {}) : unauthorized()),
      { accessToken: 'stale' },
    );

    await expect(api.get('/api/accounts')).rejects.toMatchObject({ status: 500 });
    expect(tokenStore.hasSession()).toBe(true);
  });

  it('бере refresh-токен зі сховища в момент оновлення, а не раніше', async () => {
    const server = rotatingServer();
    const { api, storage, refreshCalls } = setup(server.handler, { accessToken: 'stale' });
    // інша вкладка оновила токен: сервер уже чекає refresh-2
    await server.handler({
      method: 'POST',
      path: '/api/auth/refresh',
      search: '',
      authorization: undefined,
      body: { refreshToken: 'refresh-1' },
    });
    storage.setItem('hf.refreshToken', 'refresh-2');

    expect(await api.get('/api/accounts')).toEqual({ path: '/api/accounts' });
    expect(refreshCalls()[0]!.body).toEqual({ refreshToken: 'refresh-2' });
  });

  it('якщо повтор після оновлення теж дає 401, повертає помилку без зациклення', async () => {
    const { api, calls } = setup(
      (call) =>
        call.path === '/api/auth/refresh'
          ? json(200, { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 })
          : unauthorized(),
      { accessToken: 'stale' },
    );

    await expect(api.get('/api/accounts')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(3);
  });
});

describe('запити без авторизації', () => {
  it('не додають токен і не запускають оновлення на 401', async () => {
    const { api, calls, tokenStore } = setup(() =>
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Невірний email або пароль' } }),
    );

    await expect(
      api.post('/api/auth/login', { email: 'a@example.com', password: 'x' }, { auth: false }),
    ).rejects.toMatchObject({ status: 401, message: 'Невірний email або пароль' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.authorization).toBeUndefined();
    expect(tokenStore.hasSession()).toBe(true);
  });
});

describe('download', () => {
  const CSV = '\uFEFFДата;Сума\r\n2026-03-01;1284,50\r\n';
  const csvResponse = () =>
    new Response(CSV, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="expenses-2026-03.csv"',
      },
    });

  it('повертає вміст файлу й назву з Content-Disposition, передає параметри й токен', async () => {
    const { api, calls } = setup(() => csvResponse());

    const file = await api.download('/api/transactions/export.csv', { month: '2026-03' });

    expect(file.filename).toBe('expenses-2026-03.csv');
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(new TextEncoder().encode(CSV));
    expect(calls).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/api/transactions/export.csv',
        search: '?month=2026-03',
        authorization: 'Bearer access-1',
      }),
    ]);
  });

  it('AC23: з простроченим токеном спершу оновлює його, потім повторює завантаження', async () => {
    const server = rotatingServer();
    const { api, calls, tokenStore } = setup(
      async (call) => {
        if (call.path === '/api/auth/refresh') return server.handler(call);
        return call.authorization === 'Bearer access-2' ? csvResponse() : unauthorized();
      },
      { accessToken: 'stale' },
    );

    const file = await api.download('/api/transactions/export.csv', { month: '2026-03' });

    expect(file.filename).toBe('expenses-2026-03.csv');
    expect(calls.map((call) => call.path)).toEqual([
      '/api/transactions/export.csv',
      '/api/auth/refresh',
      '/api/transactions/export.csv',
    ]);
    expect(calls[2]!.authorization).toBe('Bearer access-2');
    expect(tokenStore.getAccessToken()).toBe('access-2');
  });

  it('якщо оновити токен не вдалося, завершує сесію', async () => {
    const { api, tokenStore } = setup(() => unauthorized(), { accessToken: 'stale' });

    await expect(api.download('/api/transactions/export.csv')).rejects.toMatchObject({
      status: 401,
    });
    expect(tokenStore.hasSession()).toBe(false);
  });

  it('помилку API розбирає як ApiError', async () => {
    const { api } = setup(() =>
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Некоректні дані' } }),
    );

    const error = await api
      .download('/api/transactions/export.csv', { month: 'abc' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('збій мережі — NetworkError', async () => {
    const { api } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.download('/api/transactions/export.csv')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('filenameFromDisposition', () => {
  it.each([
    ['attachment; filename="expenses-2026-03.csv"', 'expenses-2026-03.csv'],
    ['attachment; filename=expenses-2026-03.csv', 'expenses-2026-03.csv'],
    ['attachment; filename=report.csv; size=10', 'report.csv'],
    ['attachment', undefined],
    [null, undefined],
  ])('%j -> %j', (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });
});

describe('tokenStore', () => {
  it('тримає access-токен у памʼяті, а refresh-токен у сховищі', () => {
    const storage = memoryStorage();
    const store = createTokenStore(storage);
    store.setTokens({ accessToken: 'a', refreshToken: 'r' });

    expect(storage.getItem('hf.refreshToken')).toBe('r');
    expect(createTokenStore(storage).getAccessToken()).toBeUndefined();
    expect(createTokenStore(storage).hasSession()).toBe(true);
  });

  it('сповіщає підписників і реагує на вихід в іншій вкладці', () => {
    const storage = memoryStorage();
    const store = createTokenStore(storage);
    let notified = 0;
    const unsubscribe = store.subscribe(() => (notified += 1));

    store.setTokens({ accessToken: 'a', refreshToken: 'r' });
    storage.removeItem('hf.refreshToken');
    store.syncFromStorage();

    expect(notified).toBe(2);
    expect(store.getAccessToken()).toBeUndefined();
    expect(store.hasSession()).toBe(false);

    unsubscribe();
    store.clear();
    expect(notified).toBe(2);
  });

  it('працює, коли сховище недоступне', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const store = createTokenStore(broken);

    expect(() => store.setTokens({ accessToken: 'a', refreshToken: 'r' })).not.toThrow();
    expect(store.getAccessToken()).toBe('a');
    expect(store.hasSession()).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });
});
