-- Create Postgres sequences to generate ids for newsletters, drafts,
-- articles, and approval_logs. These tables use plain integer primary
-- keys (no DB-level autoincrement) - ids were previously computed in
-- application code as max(existing id) + 1 over an in-memory snapshot,
-- which is racy under concurrent writes (two requests can compute the
-- same "next" id at the same time). A Postgres sequence's nextval() is
-- atomic and collision-free no matter how many callers hit it at once.
--
-- Each sequence is seeded to start one past the current max id in its
-- table, so newly-generated ids never collide with existing rows.
-- Idempotent: CREATE SEQUENCE IF NOT EXISTS is a no-op (including the
-- START WITH value) if the sequence already exists, so re-running this
-- migration never resets a sequence that has already advanced from
-- real usage.
DO $$
DECLARE
  next_newsletter_id INTEGER;
  next_draft_id INTEGER;
  next_article_id INTEGER;
  next_approval_log_id INTEGER;
BEGIN
  SELECT COALESCE(MAX(id), 0) + 1 INTO next_newsletter_id FROM newsletters;
  SELECT COALESCE(MAX(id), 0) + 1 INTO next_draft_id FROM drafts;
  SELECT COALESCE(MAX(id), 0) + 1 INTO next_article_id FROM articles;
  SELECT COALESCE(MAX(id), 0) + 1 INTO next_approval_log_id FROM approval_logs;

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS newsletters_id_seq START WITH %s', next_newsletter_id);
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS drafts_id_seq START WITH %s', next_draft_id);
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS articles_id_seq START WITH %s', next_article_id);
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS approval_logs_id_seq START WITH %s', next_approval_log_id);
END $$;
