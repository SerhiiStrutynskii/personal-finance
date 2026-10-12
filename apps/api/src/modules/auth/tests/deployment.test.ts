import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.ts';
import { loadEnv } from '../../../config/env.ts';
import { TEST_JWT_SECRET, setupTestApp } from '../../../test/harness.ts';

const { app: openApp, db } = setupTestApp();

// Каталог, що імітує зібраний фронтенд.
const webDistDir = mkdtempSync(join(tmpdir(), 'hf-web-'));
writeFileSync(join(webDistDir, 'index.html'), '<!doctype html><title>Prospera</title>');
writeFileSync(join(webDistDir, 'app.js'), 'console.log("app")');
afterAll(() => rmSync(webDistDir, { recursive: true, force: true }));

const options = { db, corsOrigin: 'http://localhost', jwtSecret: TEST_JWT_SECRET };
const closedApp = createApp({ ...options, registrationEnabled: false });
const servingApp = createApp({ ...options, webDistDir });

const registration = {
  name: 'Тест',
  email: 'new@example.com',
  password: 'a-long-test-password',
};

describe('закрита реєстрація', () => {
  it('за замовчуванням реєстрація відкрита', async () => {
    expect((await request(openApp).get('/api/auth/config')).body).toEqual({
      registrationEnabled: true,
    });
    expect((await request(openApp).post('/api/auth/register').send(registration)).status).toBe(201);
  });

  it('закрита реєстрація відхиляє нових користувачів, але не заважає входу', async () => {
    await request(openApp).post('/api/auth/register').send(registration);

    expect((await request(closedApp).get('/api/auth/config')).body).toEqual({
      registrationEnabled: false,
    });
    const res = await request(closedApp)
      .post('/api/auth/register')
      .send({ ...registration, email: 'other@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');

    const login = await request(closedApp)
      .post('/api/auth/login')
      .send({ email: registration.email, password: registration.password });
    expect(login.status).toBe(200);
    const stranger = await request(closedApp)
      .post('/api/auth/login')
      .send({ email: 'other@example.com', password: registration.password });
    expect(stranger.status).toBe(401);
  });

  it('відмова не залежить від того, чи коректні дані', async () => {
    const res = await request(closedApp).post('/api/auth/register').send({});
    expect(res.status).toBe(403);
  });
});

describe('роздача фронтенду', () => {
  it('віддає статичні файли й index.html для маршрутів застосунку', async () => {
    const asset = await request(servingApp).get('/app.js');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('console.log');

    for (const path of ['/', '/budget', '/debts/123', '/goals?x=1']) {
      const page = await request(servingApp).get(path);
      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.text).toContain('Prospera');
    }
  });

  it('API і перевірка стану лишаються собою', async () => {
    expect((await request(servingApp).get('/health')).body).toEqual({ status: 'ok' });
    // невідомий маршрут API відповідає JSON-помилкою, а не сторінкою застосунку
    const unknown = await request(servingApp).get('/api/unknown');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('UNAUTHORIZED');
    expect((await request(servingApp).get('/api/accounts')).status).toBe(401);
    // корінь API — теж не сторінка застосунку
    expect((await request(servingApp).get('/api')).headers['content-type']).toContain('json');
  });

  it('файли поза каталогом фронтенду недоступні', async () => {
    const res = await request(servingApp).get('/../package.json');
    expect(res.text).not.toContain('"name"');
  });

  it('без каталогу фронтенду сторінки не віддаються', async () => {
    expect((await request(openApp).get('/budget')).status).toBe(404);
  });
});

describe('довіра до проксі', () => {
  /** Чи вважає застосунок адресу на цьому кроці ланцюжка проксі довіреною. */
  const trusts = (trustProxy: number, hop: number) => {
    const app = createApp({ ...options, trustProxy });
    return (app.get('trust proxy fn') as (ip: string, hop: number) => boolean)('10.0.0.1', hop);
  };

  it('без проксі заголовку X-Forwarded-For не довіряємо', () => {
    expect(trusts(0, 0)).toBe(false);
  });

  it('з одним проксі довіряємо лише найближчому', () => {
    expect(trusts(1, 0)).toBe(true);
    expect(trusts(1, 1)).toBe(false);
  });

  it('обмеження спроб входу рахує за адресою клієнта, а не проксі', async () => {
    const app = createApp({ ...options, trustProxy: 1 });
    const attempt = (clientIp: string) =>
      request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send({ email: 'nobody@example.com', password: 'wrong-password-123' });

    let last = await attempt('203.0.113.7');
    for (let count = 0; count < 20 && last.status !== 429; count += 1) {
      last = await attempt('203.0.113.7');
    }
    expect(last.status).toBe(429);
    // інший клієнт за тим самим проксі не заблокований
    expect((await attempt('203.0.113.8')).status).toBe(401);
  });
});

describe('налаштування оточення', () => {
  const base = {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('значення за замовчуванням: реєстрація відкрита, фронтенд не роздається, проксі немає', () => {
    expect(loadEnv(base)).toMatchObject({
      REGISTRATION_ENABLED: true,
      TRUST_PROXY: 0,
      NODE_ENV: 'production',
    });
    expect(loadEnv(base).WEB_DIST_DIR).toBeUndefined();
  });

  it('продакшн-налаштування', () => {
    const env = loadEnv({
      ...base,
      REGISTRATION_ENABLED: 'false',
      WEB_DIST_DIR: '../web/dist',
      TRUST_PROXY: '1',
    });
    expect(env).toMatchObject({
      REGISTRATION_ENABLED: false,
      WEB_DIST_DIR: '../web/dist',
      TRUST_PROXY: 1,
    });
  });

  it('некоректні значення відхиляються', () => {
    expect(() => loadEnv({ ...base, REGISTRATION_ENABLED: 'no' })).toThrow();
    expect(() => loadEnv({ ...base, TRUST_PROXY: '-1' })).toThrow();
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow();
  });
});
