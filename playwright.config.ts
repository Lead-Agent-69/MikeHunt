import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Not wired into CI: run with `npm run e2e` (local build) or `npm run e2e:prod`.
 *
 *   E2E_BASE_URL   target origin (default http://localhost:3000). A non-local origin is treated as
 *                  PROD: only the read-only guest specs run, sequentially, and every sign-in or
 *                  write flow is skipped (see e2e/support/target.ts).
 *   E2E_CHROME     optional Chrome/Chromium binary (e.g. /usr/bin/google-chrome) when Playwright's
 *                  bundled browser is not installed.
 *   E2E_ADMIN_EMAIL  local admin account (must equal the local server's ADMIN_EMAIL) for /status.
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(
  baseURL,
);
const launchOptions = process.env.E2E_CHROME
  ? { executablePath: process.env.E2E_CHROME }
  : {};

export default defineConfig({
  testDir: "./e2e",
  // Prod: one worker, no parallelism, no retries — gentle on Vercel Hobby quotas.
  fullyParallel: isLocal,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI && isLocal ? 2 : 0,
  workers: isLocal ? (process.env.CI ? 1 : 2) : 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/e2e-results.json" }],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    // Creates the local desk accounts (personal/reseller/dealer/parts + admin) once; skipped on prod.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-390",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
