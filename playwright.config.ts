import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    ...devices["Pixel 7"],
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "docker compose -f compose.local.yaml up --build",
        url: "http://localhost:8080/rt/health",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
