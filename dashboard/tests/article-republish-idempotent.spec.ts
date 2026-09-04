import { test, expect } from "@playwright/test";

import { publishArticlesForNewsletter } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("republishing keeps the same article URL for an unchanged section", async () => {
  const newsletterId = await withDatabase(async (db) => {
    const draftId = await nextId("drafts");
    const newsletterIdInner = await nextId("newsletters");
    const now = new Date().toISOString();
    db.newsletters.push({
      id: newsletterIdInner,
      issue_number: 997000 + newsletterIdInner,
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
      newsletter_id: newsletterIdInner,
      raw_data: {},
      ai_draft: {
        sections: [
          { section_type: "market_pulse", title: "First title", teaser: "t", body: "b", audience_tag: "REO" },
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
    return newsletterIdInner;
  });

  try {
    const first = await publishArticlesForNewsletter(newsletterId);
    const second = await publishArticlesForNewsletter(newsletterId);

    expect(first.article_urls).toEqual(second.article_urls);
  } finally {
    await withDatabase((db) => {
      db.articles = db.articles.filter((item) => item.newsletter_id !== newsletterId);
      db.drafts = db.drafts.filter((item) => item.newsletter_id !== newsletterId);
      db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    });
  }
});
