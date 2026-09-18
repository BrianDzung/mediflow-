import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? "e2e-staging-reset-token";
const AUTH_SECRET = process.env.E2E_AUTH_SECRET ?? "e2e-demo-secret-not-for-production-use-32ch";

process.env.E2E_RESET_TOKEN = RESET_TOKEN;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: existsSync(".next") ? "npm run staging:start" : "npm run build && npm run staging:start",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: "file:./e2e.db",
      AUTH_SECRET,
      STAGING_RESET_TOKEN: RESET_TOKEN,
      SEED_ON_START: "if-empty",
      COOKIE_SECURE: "false",
      PORT,
      HOSTNAME: "127.0.0.1",
    },
  },
});
