import { defineConfig, devices } from '@playwright/test';

// Окремі порти, щоб E2E не заважали локальній розробці (3000 і 5173).
const API_PORT = 3100;
const WEB_PORT = 5174;
const webOrigin = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Тести ділять одну тестову базу.
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: webOrigin,
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:server -w @hf/api',
      url: `http://localhost:${API_PORT}/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_ORIGIN: webOrigin },
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -w @hf/web -- --port ${WEB_PORT} --strictPort`,
      url: webOrigin,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
