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

-- Operational tables
CREATE TABLE IF NOT EXISTS "workflow_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context_json" TEXT,
    CONSTRAINT "workflow_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pipeline_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "requested_by" TEXT,
    "started_at" TEXT,
    "completed_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "result_json" TEXT,
    "error_detail" TEXT,
    "lease_expires_at" TEXT,
    CONSTRAINT "pipeline_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "login_attempts" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TEXT NOT NULL,
    "blocked_until" TEXT,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("key")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "newsletters_issue_date_idx" ON "newsletters"("issue_date");
CREATE INDEX IF NOT EXISTS "newsletters_status_idx" ON "newsletters"("status");
CREATE INDEX IF NOT EXISTS "drafts_newsletter_id_idx" ON "drafts"("newsletter_id");
CREATE INDEX IF NOT EXISTS "drafts_status_idx" ON "drafts"("status");
CREATE INDEX IF NOT EXISTS "articles_newsletter_id_idx" ON "articles"("newsletter_id");
CREATE INDEX IF NOT EXISTS "approval_logs_draft_id_idx" ON "approval_logs"("draft_id");
CREATE INDEX IF NOT EXISTS "approval_logs_timestamp_idx" ON "approval_logs"("timestamp");
CREATE INDEX IF NOT EXISTS "workflow_logs_timestamp_idx" ON "workflow_logs"("timestamp");
CREATE INDEX IF NOT EXISTS "workflow_logs_scope_step_idx" ON "workflow_logs"("scope", "step");
CREATE INDEX IF NOT EXISTS "pipeline_jobs_status_created_idx" ON "pipeline_jobs"("status", "created_at");
CREATE INDEX IF NOT EXISTS "login_attempts_blocked_until_idx" ON "login_attempts"("blocked_until");

-- Foreign key constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drafts_newsletter_id_fkey'
  ) THEN
    ALTER TABLE "drafts"
      ADD CONSTRAINT "drafts_newsletter_id_fkey"
      FOREIGN KEY ("newsletter_id")
      REFERENCES "newsletters"("id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'articles_newsletter_id_fkey'
  ) THEN
    ALTER TABLE "articles"
      ADD CONSTRAINT "articles_newsletter_id_fkey"
      FOREIGN KEY ("newsletter_id")
      REFERENCES "newsletters"("id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_logs_draft_id_fkey'
  ) THEN
    ALTER TABLE "approval_logs"
      ADD CONSTRAINT "approval_logs_draft_id_fkey"
      FOREIGN KEY ("draft_id")
      REFERENCES "drafts"("id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;
