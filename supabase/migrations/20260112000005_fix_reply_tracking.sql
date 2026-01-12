-- Migration: Fix reply tracking and verification
-- Addresses issues with replies going to wrong accounts and reply-to field bugs

-- ============================================
-- Add tracking mode flag to email_logs
-- ============================================
-- This flag indicates whether the email was sent with tracking reply-to address
-- (reply-{id}@domain) or with the sender's actual email address
ALTER TABLE email_logs
ADD COLUMN IF NOT EXISTS use_tracking_reply BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN email_logs.use_tracking_reply IS 'True if email was sent with tracking reply-to (reply-{id}@domain), false if sent with sender email';

-- ============================================
-- Add sender verification to email_replies
-- ============================================
-- Track whether the reply sender matches the original recipient
ALTER TABLE email_replies
ADD COLUMN IF NOT EXISTS sender_verified BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS expected_sender_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

COMMENT ON COLUMN email_replies.sender_verified IS 'True if reply from_email matches original to_email exactly';
COMMENT ON COLUMN email_replies.expected_sender_email IS 'The original to_email from the sent email (expected reply sender)';
COMMENT ON COLUMN email_replies.verification_notes IS 'Notes about sender verification (mismatch details, etc)';

-- Index for finding unverified replies
CREATE INDEX IF NOT EXISTS idx_email_replies_unverified
ON email_replies(owner_id, sender_verified)
WHERE sender_verified = FALSE;

-- ============================================
-- Fix attachments column name discrepancy
-- ============================================
-- The migration created attachments_info but the code uses attachments
-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_replies' AND column_name = 'attachments'
  ) THEN
    ALTER TABLE email_replies ADD COLUMN attachments JSONB DEFAULT '[]';
  END IF;
END $$;
