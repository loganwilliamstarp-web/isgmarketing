-- Backfill email_events with star_rating entries for existing survey responses
-- The star-rating edge function previously had wrong column names (event_timestamp,
-- raw_payload) causing inserts to silently fail. This backfills from accounts table.

-- First, check actual column names by trying raw_payload/event_timestamp
-- (the remote table may have been created with different columns than the migration file)
INSERT INTO email_events (email_log_id, event_type, raw_payload, event_timestamp)
SELECT
  a.survey_email_log_id,
  'star_rating',
  jsonb_build_object('rating', a.survey_stars, 'account_id', a.account_unique_id),
  COALESCE(a.survey_completed_at, NOW())
FROM accounts a
WHERE a.survey_stars IS NOT NULL
  AND a.survey_email_log_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_events ee
    WHERE ee.email_log_id = a.survey_email_log_id
      AND ee.event_type = 'star_rating'
  );
