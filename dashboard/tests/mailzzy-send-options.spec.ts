import { test, expect } from "@playwright/test";

import { getMailzzyGroupCounts, getMailzzySenders } from "@/server/mailchimp";

test("getMailzzyGroupCounts returns counts for the Registered and Not Registered groups", async () => {
  const counts = await getMailzzyGroupCounts();
  expect(typeof counts["1085"]).toBe("number");
  expect(typeof counts["1086"]).toBe("number");
});

test("getMailzzySenders returns at least the one known configured sender", async () => {
  const senders = await getMailzzySenders();
  expect(Array.isArray(senders)).toBe(true);
  const known = senders.find((sender) => sender.email === "insights@ufsmedia.com");
  expect(known).toBeDefined();
  expect(known?.domainVerified).toBe(true);
});
