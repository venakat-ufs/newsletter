-- Remove vrm_va_reo from all drafts belonging to newsletter issue #48
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/beapnobefsyhipwhpbyi/sql

-- Step 1: Preview what will be changed (run this first to confirm)
SELECT
  d.id AS draft_id,
  d.status,
  d.raw_data ? 'vrm_va_reo' AS has_vrm_in_raw_data
FROM drafts d
JOIN newsletters n ON n.id = d.newsletter_id
WHERE n.issue_number = 48;

-- Step 2: Remove vrm_va_reo key from raw_data on every draft for issue #48
UPDATE drafts
SET raw_data = raw_data - 'vrm_va_reo'
WHERE newsletter_id = (
  SELECT id FROM newsletters WHERE issue_number = 48 LIMIT 1
)
AND raw_data ? 'vrm_va_reo';

-- Step 3: Verify no vrm_va_reo remains
SELECT
  d.id,
  d.status,
  d.raw_data ? 'vrm_va_reo' AS vrm_still_present
FROM drafts d
JOIN newsletters n ON n.id = d.newsletter_id
WHERE n.issue_number = 48;
-- Expected: vrm_still_present = false for all rows
