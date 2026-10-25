import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;
const backendDir = path.resolve(__dirname, "../backend");
const databaseFile = "/tmp/caregap-e2e.db";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(chromePath && existsSync(chromePath)
        ? { executablePath: chromePath }
        : {}),
      args: ["--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: `rm -f ${databaseFile} && CAREGAP_DATABASE_URL=sqlite:///${databaseFile} CAREGAP_CORS_ORIGINS=http://127.0.0.1:3000,http://localhost:3000 ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: backendDir,
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      cwd: __dirname,
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
