-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletters" (
    "id" INTEGER NOT NULL,
    "issue_number" INTEGER NOT NULL,
    "issue_date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mailchimp_campaign_id" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "drafts" (
    "id" INTEGER NOT NULL,
    "newsletter_id" INTEGER NOT NULL,
    "raw_data" TEXT NOT NULL,
    "ai_draft" TEXT NOT NULL,
    "human_edits" TEXT,
    "status" TEXT NOT NULL,
    "reviewer_email" TEXT,
    "reviewed_at" TEXT,
    "sources_used" TEXT,
    "sources_warning" TEXT,
    "sources_failed" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "articles" (
    "id" INTEGER NOT NULL,
    "newsletter_id" INTEGER NOT NULL,
    "section_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teaser" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience_tag" TEXT NOT NULL,
    "publish_date" TEXT,
    "ms_platform_url" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "approval_logs" (
    "id" INTEGER NOT NULL,
    "draft_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "notes" TEXT,
    "timestamp" TEXT NOT NULL,
    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id")
);
