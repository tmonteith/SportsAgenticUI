import { defineConfig, devices } from "@playwright/test"

const MOCK_PORT = 8899
const APP_PORT = 4173

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "node tests/mock-server.mjs",
      url: `http://localhost:${MOCK_PORT}/__state`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm build && pnpm preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${MOCK_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
