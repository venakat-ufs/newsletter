import { test, expect } from "@playwright/test";

import { claimNewsletterForSending, releaseNewsletterClaim } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("claimNewsletterForSending only lets one concurrent caller win", async () => {
  const newsletterId = await withDatabase((db) => {
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 999000 + id,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      registered_send_status: null,
      registered_campaign_id: null,
      prospect_send_status: null,
      prospect_campaign_id: null,
      sender_email: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  const [first, second] = await Promise.all([
    claimNewsletterForSending(newsletterId),
    claimNewsletterForSending(newsletterId),
  ]);

  const claimedCount = [first, second].filter((result) => result.claimed).length;
  expect(claimedCount).toBe(1);

  await releaseNewsletterClaim(newsletterId, "approved");
  const afterRelease = await claimNewsletterForSending(newsletterId);
  expect(afterRelease.claimed).toBe(true);

  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
  });
});
