-- Backfill automation_enrollments from historical send data.
--
-- automation_enrollments existed in the schema but was never populated - the
-- engine derived enrollment limits from email_logs instead. The send loop now
-- records enrollments as emails go out (recordEnrollmentSend in
-- process-scheduled-emails), and this migration backfills one enrollment per
-- (automation, account) pair that has historical successful sends, so
-- reporting over the table starts out complete.
--
-- Limit checks still read email_logs (the complete historical record); the
-- backfilled rows are marked in metadata so they can be told apart from
-- organically tracked enrollments.

INSERT INTO automation_enrollments (
  automation_id,
  account_id,
  status,
  enrolled_at,
  last_action_at,
  completed_at,
  emails_sent,
  metadata
)
SELECT
  el.automation_id,
  el.account_id,
  'Completed',
  MIN(el.sent_at),
  MAX(el.sent_at),
  MAX(el.sent_at),
  COUNT(*),
  jsonb_build_object('backfilled_from', 'email_logs', 'backfilled_at', NOW())
FROM email_logs el
WHERE el.automation_id IS NOT NULL
  AND el.account_id IS NOT NULL
  AND el.sent_at IS NOT NULL
  AND el.status IN ('Sent', 'Delivered', 'Opened', 'Clicked')
  -- FK targets must still exist
  AND EXISTS (SELECT 1 FROM automations a WHERE a.id = el.automation_id)
  AND EXISTS (SELECT 1 FROM accounts ac WHERE ac.account_unique_id = el.account_id)
  -- idempotent: skip pairs that already have any enrollment row
  AND NOT EXISTS (
    SELECT 1 FROM automation_enrollments ae
    WHERE ae.automation_id = el.automation_id
      AND ae.account_id = el.account_id
  )
GROUP BY el.automation_id, el.account_id;
