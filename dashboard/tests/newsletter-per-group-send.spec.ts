import { test, expect } from "@playwright/test";

import { sendNewsletterToGroups } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("sending only the registered group leaves prospect untouched", async () => {
  const newsletterId = await withDatabase((db) => {
    const draftId = nextId(db.drafts);
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 996000 + id,
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
    db.drafts.push({
      id: draftId,
      newsletter_id: id,
      raw_data: {},
      ai_draft: { sections: [{ section_type: "market_pulse", title: "T", teaser: "t", body: "b", audience_tag: "REO" }] },
      human_edits: null,
      status: "approved",
      reviewer_email: null,
      reviewed_at: null,
      sources_used: null,
      sources_warning: null,
      sources_failed: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  // The real .env has MAILZZY_ON_HOLD=false with live credentials configured,
  // so this test MUST be run with MAILZZY_ON_HOLD=true set in the shell
  // environment (dotenv-cli does not override already-set vars) to force
  // getMailchimpBlockReason() to short-circuit before any real send call —
  // otherwise this would attempt a real campaign send. See the exact
  // command in the test-running instructions for this file.
  // This test only asserts prospect stays untouched; it does not assert
  // registered actually reached "sent".
  await sendNewsletterToGroups(newsletterId, ["registered"], "venakat@unitedffs.com").catch(() => {
    // A failed/blocked send is an acceptable outcome for this assertion.
  });

  const after = await withDatabase((db) => db.newsletters.find((item) => item.id === newsletterId));
  expect(after?.prospect_send_status).toBeNull();

  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
  });
});

test("a group already marked sent is not re-attempted on a second call", async () => {
  const newsletterId = await withDatabase((db) => {
    const draftId = nextId(db.drafts);
    const id = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 995000 + id,
      issue_date: now,
      status: "approved",
      mailchimp_campaign_id: null,
      registered_send_status: "sent",
      registered_campaign_id: "existing-campaign-123",
      prospect_send_status: null,
      prospect_campaign_id: null,
      sender_email: "venakat@unitedffs.com",
      created_at: now,
      updated_at: now,
    });
    db.drafts.push({
      id: draftId,
      newsletter_id: id,
      raw_data: {},
      ai_draft: { sections: [{ section_type: "market_pulse", title: "T", teaser: "t", body: "b", audience_tag: "REO" }] },
      human_edits: null,
      status: "approved",
      reviewer_email: null,
      reviewed_at: null,
      sources_used: null,
      sources_warning: null,
      sources_failed: null,
      created_at: now,
      updated_at: now,
    });
    return id;
  });

  const { results } = await sendNewsletterToGroups(newsletterId, ["registered"], "venakat@unitedffs.com");
  expect(results.registered.attempted).toBe(false);
  expect(results.registered.campaignId).toBe("existing-campaign-123");

  await withDatabase((db) => {
    db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
  });
});
