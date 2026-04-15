import { defineConfig, devices } from "@playwright/test";

const disableWebServer = process.env.PW_DISABLE_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3103",
    trace: "retain-on-failure",
  },
  ...(disableWebServer
    ? {}
    : {
        webServer: {
          command: "npm run dev:playwright -- --hostname 127.0.0.1 --port 3103",
          // / returns a redirect in this app; use a stable 200 endpoint for readiness.
          url: "http://127.0.0.1:3103/login",
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
