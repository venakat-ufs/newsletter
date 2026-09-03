import { test, expect } from "@playwright/test";

import { getPublicArticleMarkup } from "@/server/workflow";
import { withDatabase, nextId } from "@/server/store";

test("public article markup escapes a malicious title", async () => {
  let newsletterId = 0;
  const articleId = await withDatabase((db) => {
    newsletterId = nextId(db.newsletters);
    const now = new Date().toISOString();
    db.newsletters.push({
      id: newsletterId,
      issue_number: 998000 + newsletterId,
      issue_date: now,
      status: "sent",
      mailchimp_campaign_id: null,
      registered_send_status: null,
      registered_campaign_id: null,
      prospect_send_status: null,
      prospect_campaign_id: null,
      sender_email: null,
      created_at: now,
      updated_at: now,
    });

    const id = nextId(db.articles);
    db.articles.push({
      id,
      newsletter_id: newsletterId,
      section_type: "market_pulse",
      title: '<script>window.__pwned = true;</script>',
      teaser: "safe teaser",
      body: "safe body",
      audience_tag: "REO",
      publish_date: now,
      ms_platform_url: null,
      created_at: now,
    });
    return id;
  });

  try {
    const html = await getPublicArticleMarkup(articleId);
    expect(html).not.toContain("<script>window.__pwned");
    expect(html).toContain("&lt;script&gt;");
  } finally {
    await withDatabase((db) => {
      db.articles = db.articles.filter((item) => item.id !== articleId);
      db.newsletters = db.newsletters.filter((item) => item.id !== newsletterId);
    });
  }
});
