import { test, expect } from "@playwright/test";

import { recordFailedLogin, checkLoginRateLimit, clearLoginRateLimit } from "@/server/login-rate-limit";

test("concurrent failed logins are all counted, no lost increments", async () => {
  const key = `race-test:${Date.now()}`;
  await clearLoginRateLimit(key);

  await Promise.all([
    recordFailedLogin(key),
    recordFailedLogin(key),
    recordFailedLogin(key),
    recordFailedLogin(key),
    recordFailedLogin(key),
  ]);

  const result = await checkLoginRateLimit(key);
  expect(result.allowed).toBe(false);

  await clearLoginRateLimit(key);
});
