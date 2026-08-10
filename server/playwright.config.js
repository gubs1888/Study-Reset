import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const testPort = Number(process.env.TEST_PORT) || 4173;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl || `http://127.0.0.1:${testPort}`;
const serverDirectory = fileURLToPath(new URL(".", import.meta.url));
const systemChrome = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate) => candidate && existsSync(candidate));

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    headless: true,
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: externalBaseUrl ? undefined : {
    command: "node tests/e2eServer.js",
    cwd: serverDirectory,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "studyreset-browser-test-secret-at-least-32-characters",
      TEST_PORT: String(testPort),
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: systemChrome ? "system-chrome" : "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: systemChrome ? { executablePath: systemChrome } : {},
      },
    },
  ],
});
