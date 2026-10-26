import type { AuthTokens } from '@hf/shared';
import type { TokenStore } from './tokenStore.ts';

export interface ApiIssue {
  path: string;
  message: string;
}

/** Відповідь API з помилкою (4xx/5xx). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[];

  constructor(status: number, code: string, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** Сервер недоступний або з'єднання обірвалося. */
export class NetworkError extends Error {
  constructor() {
    super('Немає звʼязку із сервером');
    this.name = 'NetworkError';
  }
}

type Query = Record<string, string | number | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** false — запит без токена (вхід, реєстрація). За замовчуванням true. */
  auth?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetch?: typeof fetch;
  /** Виконує оновлення токена по черзі між вкладками браузера. */
  lock?: <T>(run: () => Promise<T>) => Promise<T>;
}

const sessionExpired = () => new ApiError(401, 'UNAUTHORIZED', 'Потрібна авторизація');

async function toError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as {
      error?: { code?: string; message?: string; issues?: ApiIssue[] };
    };
    if (error?.code && error.message) {
      return new ApiError(res.status, error.code, error.message, error.issues);
    }
  } catch {
    // тіло не JSON
  }
  return new ApiError(res.status, 'UNKNOWN', 'Сталася помилка. Спробуйте ще раз');
}

export interface DownloadedFile {
  blob: Blob;
  filename: string | undefined;
}

/** Назва файлу з `Content-Disposition: attachment; filename="…"`; undefined, якщо її немає. */
export function filenameFromDisposition(header: string | null): string | undefined {
  const match = header?.match(/filename="([^"]+)"|filename=([^;\s]+)/i);
  return match?.[1] ?? match?.[2];
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createApiClient({
  baseUrl,
  tokenStore,
  fetch: customFetch,
  lock,
}: ApiClientOptions) {
  const runExclusive = lock ?? ((run) => run());
  let refreshing: Promise<boolean> | undefined;

  async function send(
    method: string,
    path: string,
    { body, query }: RequestOptions,
    accessToken?: string,
  ): Promise<Response> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    try {
      return await (customFetch ?? fetch)(url, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch {
      throw new NetworkError();
    }
  }

  /**
   * Оновлює пару токенів. Усі запити, що одночасно отримали 401, чекають на одне оновлення:
   * refresh-токен одноразовий, і друге використання сервер сприймає як крадіжку.
   * Повертає false, якщо сесія закінчилася.
   */
  function refresh(): Promise<boolean> {
    refreshing ??= runExclusive(async () => {
      // Читаємо зі сховища вже під блокуванням: інша вкладка могла щойно замінити токен.
      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) {
        tokenStore.clear();
        return false;
      }
      const res = await send('POST', '/api/auth/refresh', { body: { refreshToken } });
      if (res.status === 401) {
        tokenStore.clear();
        return false;
      }
      tokenStore.setTokens(await parse<AuthTokens>(res));
      return true;
    }).finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  /** Запит із токеном: за 401 один раз оновлює токен і повторює. Повертає сиру відповідь. */
  async function sendAuthorized(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<Response> {
    if (options.auth === false) return send(method, path, options);

    let token = tokenStore.getAccessToken();
    if (!token) {
      if (!(await refresh())) throw sessionExpired();
      token = tokenStore.getAccessToken();
    }

    const res = await send(method, path, options, token);
    if (res.status !== 401) return res;
    // Якщо токен уже оновив паралельний запит, достатньо повторити з новим.
    const alreadyRefreshed = tokenStore.getAccessToken() !== token;
    if (!alreadyRefreshed && !(await refresh())) throw sessionExpired();
    const fresh = tokenStore.getAccessToken();
    if (!fresh) throw sessionExpired();
    return send(method, path, options, fresh);
  }

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    return parse<T>(await sendAuthorized(method, path, options));
  }

  /** GET файлу (не JSON): вміст і назва з Content-Disposition. Помилки — як у request. */
  async function download(path: string, query?: Query): Promise<DownloadedFile> {
    const res = await sendAuthorized('GET', path, query ? { query } : {});
    if (!res.ok) throw await toError(res);
    return {
      blob: await res.blob(),
      filename: filenameFromDisposition(res.headers.get('Content-Disposition')),
    };
  }

  return {
    get: <T>(path: string, query?: Query, options?: RequestOptions) =>
      request<T>('GET', path, { ...options, ...(query && { query }) }),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      request<T>('POST', path, { ...options, body }),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
    delete: <T = void>(path: string) => request<T>('DELETE', path),
    download,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
