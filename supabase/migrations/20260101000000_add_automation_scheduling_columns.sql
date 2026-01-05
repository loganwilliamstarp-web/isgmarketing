-- Migration: Add automation scheduling columns to scheduled_emails
-- This migration adds columns needed for the automation scheduler feature
-- which pre-calculates all qualifying send dates and verifies 24 hours before sending

-- Add new columns to scheduled_emails table
ALTER TABLE scheduled_emails
ADD COLUMN IF NOT EXISTS qualification_value TEXT,
ADD COLUMN IF NOT EXISTS trigger_field TEXT,
ADD COLUMN IF NOT EXISTS requires_verification BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS node_id TEXT,
ADD COLUMN IF NOT EXISTS from_email TEXT,
ADD COLUMN IF NOT EXISTS from_name TEXT,
ADD COLUMN IF NOT EXISTS subject TEXT;

-- Add index for efficient querying of pending automation emails
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_automation_pending
ON scheduled_emails (automation_id, status)
WHERE status = 'Pending';

-- Add index for 24-hour verification lookup
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_verification
ON scheduled_emails (status, requires_verification, scheduled_for)
WHERE status = 'Pending' AND requires_verification = TRUE;

-- Add composite index for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_dedup
ON scheduled_emails (automation_id, account_id, template_id, qualification_value);

-- Add comment explaining the new columns
COMMENT ON COLUMN scheduled_emails.qualification_value IS 'The triggering date value (e.g., policy expiration date) used to dedupe and track why this email was scheduled';
COMMENT ON COLUMN scheduled_emails.trigger_field IS 'The field that triggered this scheduled email (e.g., policy_expiration, account_created)';
COMMENT ON COLUMN scheduled_emails.requires_verification IS 'If TRUE, email needs 24-hour pre-send verification to confirm account still qualifies';
COMMENT ON COLUMN scheduled_emails.node_id IS 'The workflow node ID that will send this email';
COMMENT ON COLUMN scheduled_emails.from_email IS 'Sender email address (copied from template for admin review)';
COMMENT ON COLUMN scheduled_emails.from_name IS 'Sender name (copied from template for admin review)';
COMMENT ON COLUMN scheduled_emails.subject IS 'Email subject line (copied from template for admin review)';
