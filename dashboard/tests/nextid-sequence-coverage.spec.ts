import { test, expect } from "@playwright/test";

import { publishArticlesForNewsletter, updateDraft } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

// Covers two nextId() -> Postgres sequence code paths that no other test
// exercises: approval_logs (via updateDraft's status-change branch) and
// publishing MULTIPLE new articles in a single call (the for-loop in
// publishArticlesForNewsletter that replaced the old .map()).

test("approving a draft creates an approval_log row with a unique sequence id", async () => {
  const newsletterId = await withDatabase(async (db) => {
    const draftId = await nextId("drafts");
    const id = await nextId("newsletters");
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 994000 + id,
      issue_date: now,
      status: "draft",
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
      status: "pending",
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

  try {
    const draftId = await withDatabase((db) => db.drafts.find((item) => item.newsletter_id === newsletterId)!.id);

    const beforeLogIds = await withDatabase((db) => db.approval_logs.map((log) => log.id));

    await updateDraft(draftId, { status: "approved", reviewer_email: "diag@example.com" });

    const afterLogs = await withDatabase((db) => db.approval_logs);
    const newLogs = afterLogs.filter((log) => !beforeLogIds.includes(log.id) && log.draft_id === draftId);

    expect(newLogs.length).toBe(1);
    expect(newLogs[0].id).toBeGreaterThan(0);
    // The new log's id must be genuinely unique across the whole table, not
    // just "new to this test" - confirms it came from the real sequence.
    const allIds = afterLogs.map((log) => log.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  } finally {
    await withDatabase((db) => {
      db.approval_logs = db.approval_logs.filter((log) => log.draft_id !== undefined && db.drafts.some((d) => d.newsletter_id === newsletterId && d.id === log.draft_id));
      db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
      db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    });
  }
});

test("publishing multiple new sections in one call creates distinct sequential article ids", async () => {
  const newsletterId = await withDatabase(async (db) => {
    const draftId = await nextId("drafts");
    const id = await nextId("newsletters");
    const now = new Date().toISOString();
    db.newsletters.push({
      id,
      issue_number: 995500 + id,
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
      ai_draft: {
        sections: [
          { section_type: "market_pulse", title: "A", teaser: "a", body: "a", audience_tag: "REO" },
          { section_type: "industry_news", title: "B", teaser: "b", body: "b", audience_tag: "REO" },
          { section_type: "bank_hiring_intel", title: "C", teaser: "c", body: "c", audience_tag: "REO" },
        ],
      },
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

  try {
    const result = await publishArticlesForNewsletter(newsletterId);
    expect(result.published).toBe(3);

    const articles = await withDatabase((db) => db.articles.filter((item) => item.newsletter_id === newsletterId));
    expect(articles.length).toBe(3);

    const ids = articles.map((article) => article.id);
    expect(new Set(ids).size).toBe(3); // all three ids are distinct
    ids.forEach((id) => expect(id).toBeGreaterThan(0));
  } finally {
    await withDatabase((db) => {
      db.articles = db.articles.filter((item) => item.newsletter_id !== newsletterId);
      db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
      db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    });
  }
});
