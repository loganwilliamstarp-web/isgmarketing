-- Complete scheduled_emails table setup for automation email scheduling
-- Run this after initial table creation or use as complete setup

-- ============================================================================
-- SCHEDULED_EMAILS TABLE
-- ============================================================================

-- Create table if not exists (for fresh installs)
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES mass_email_batches(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

  -- Recipient info
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,

  -- Sender info (copied from template for admin review)
  from_email TEXT,
  from_name TEXT,
  subject TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',

  -- Automation scheduling fields
  qualification_value TEXT,  -- The trigger date (e.g., '2026-03-15' for policy expiring that day)
  trigger_field TEXT,        -- What triggered this (e.g., 'policy_expiration')
  node_id TEXT,              -- Workflow node that sends this email
  requires_verification BOOLEAN DEFAULT FALSE,  -- Needs 24-hour pre-send check

  -- Attempt tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,

  -- Result tracking
  email_log_id UUID REFERENCES email_logs(id),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for getting pending emails ready to send
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_ready
ON scheduled_emails (status, scheduled_for, requires_verification)
WHERE status = 'Pending';

-- Index for automation-specific queries
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_automation_pending
ON scheduled_emails (automation_id, status)
WHERE status = 'Pending';

-- Index for 24-hour verification lookup
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_verification
ON scheduled_emails (status, requires_verification, scheduled_for)
WHERE status = 'Pending' AND requires_verification = TRUE;

-- Index for deduplication lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_dedup
ON scheduled_emails (automation_id, account_id, template_id, qualification_value);

-- Index for owner queries
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_owner
ON scheduled_emails (owner_id, status);

-- Index for batch queries
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_batch
ON scheduled_emails (batch_id, status)
WHERE batch_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own scheduled emails
CREATE POLICY IF NOT EXISTS "Users can view own scheduled emails"
ON scheduled_emails FOR SELECT
USING (owner_id = auth.uid()::text);

-- Policy: Users can insert their own scheduled emails
CREATE POLICY IF NOT EXISTS "Users can insert own scheduled emails"
ON scheduled_emails FOR INSERT
WITH CHECK (owner_id = auth.uid()::text);

-- Policy: Users can update their own scheduled emails
CREATE POLICY IF NOT EXISTS "Users can update own scheduled emails"
ON scheduled_emails FOR UPDATE
USING (owner_id = auth.uid()::text);

-- Policy: Users can delete their own scheduled emails
CREATE POLICY IF NOT EXISTS "Users can delete own scheduled emails"
ON scheduled_emails FOR DELETE
USING (owner_id = auth.uid()::text);

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY IF NOT EXISTS "Service role full access"
ON scheduled_emails FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE scheduled_emails IS 'Stores scheduled emails for automations and mass email batches';
COMMENT ON COLUMN scheduled_emails.qualification_value IS 'The triggering date value (e.g., policy expiration date) used to dedupe and track why this email was scheduled';
COMMENT ON COLUMN scheduled_emails.trigger_field IS 'The field that triggered this scheduled email (e.g., policy_expiration, account_created)';
COMMENT ON COLUMN scheduled_emails.requires_verification IS 'If TRUE, email needs 24-hour pre-send verification to confirm account still qualifies';
COMMENT ON COLUMN scheduled_emails.node_id IS 'The workflow node ID that will send this email';
COMMENT ON COLUMN scheduled_emails.from_email IS 'Sender email address (copied from template for admin review)';
COMMENT ON COLUMN scheduled_emails.from_name IS 'Sender name (copied from template for admin review)';
COMMENT ON COLUMN scheduled_emails.subject IS 'Email subject line (copied from template for admin review)';


-- ============================================================================
-- EMAIL_LOGS TABLE ADDITIONS (if needed)
-- ============================================================================

-- Add SendGrid tracking columns if they don't exist
ALTER TABLE email_logs
ADD COLUMN IF NOT EXISTS sendgrid_message_id TEXT,
ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bounce_type TEXT,
ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Index for SendGrid webhook lookups
CREATE INDEX IF NOT EXISTS idx_email_logs_sendgrid_id
ON email_logs (sendgrid_message_id)
WHERE sendgrid_message_id IS NOT NULL;
