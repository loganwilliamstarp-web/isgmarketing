-- ============================================================================
-- EMAIL VALIDATION - Add validation fields to accounts table
-- ============================================================================
-- This migration adds email validation tracking fields to the accounts table
-- to support SendGrid Email Validation API integration.
--
-- Strategy:
-- 1. Daily cron job validates emails that are unknown or > 90 days old
-- 2. Emails are only scheduled for accounts with 'valid' status
-- 3. When person_email changes, status resets to 'unknown'
-- ============================================================================

-- ============================================================================
-- 1. ADD VALIDATION COLUMNS TO ACCOUNTS
-- ============================================================================

-- Email validation status: valid, risky, invalid, unknown
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS email_validation_status TEXT DEFAULT 'unknown'
  CHECK (email_validation_status IS NULL OR email_validation_status IN ('valid', 'risky', 'invalid', 'unknown'));

-- Validation score from SendGrid (0.0 to 1.0)
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS email_validation_score DECIMAL(3, 2)
  CHECK (email_validation_score IS NULL OR (email_validation_score >= 0 AND email_validation_score <= 1));

-- When the email was last validated
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS email_validated_at TIMESTAMPTZ;

-- Reason for risky/invalid status (e.g., 'disposable', 'role_address', 'invalid_domain')
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS email_validation_reason TEXT;

-- SendGrid validation result details (full response for debugging)
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS email_validation_details JSONB;

-- Add comments
COMMENT ON COLUMN accounts.email_validation_status IS 'Email validation status: valid, risky, invalid, or unknown. Only valid accounts receive emails.';
COMMENT ON COLUMN accounts.email_validation_score IS 'SendGrid email validation score (0.0 to 1.0). Higher is better.';
COMMENT ON COLUMN accounts.email_validated_at IS 'Timestamp when email was last validated. Re-validate after 90 days.';
COMMENT ON COLUMN accounts.email_validation_reason IS 'Reason for risky/invalid status (e.g., disposable, role_address, invalid_domain)';
COMMENT ON COLUMN accounts.email_validation_details IS 'Full SendGrid validation response for debugging';

-- ============================================================================
-- 2. CREATE INDEXES FOR VALIDATION QUERIES
-- ============================================================================

-- Index for finding accounts that need validation (unknown status or stale)
CREATE INDEX IF NOT EXISTS idx_accounts_email_validation_needed
ON accounts (email_validation_status, email_validated_at)
WHERE email_validation_status = 'unknown'
   OR email_validation_status IS NULL;

-- Index for filtering valid accounts (used in email scheduling)
CREATE INDEX IF NOT EXISTS idx_accounts_email_valid
ON accounts (email_validation_status)
WHERE email_validation_status = 'valid';

-- Index for finding invalid/risky accounts (for reporting)
CREATE INDEX IF NOT EXISTS idx_accounts_email_invalid
ON accounts (email_validation_status, email_validation_reason)
WHERE email_validation_status IN ('invalid', 'risky');

-- ============================================================================
-- 3. CREATE TRIGGER TO RESET VALIDATION ON EMAIL CHANGE
-- ============================================================================

-- Function to reset validation status when email changes
CREATE OR REPLACE FUNCTION reset_email_validation_on_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only reset if the email actually changed (and both old and new are not null)
  IF OLD.person_email IS DISTINCT FROM NEW.person_email THEN
    NEW.email_validation_status := 'unknown';
    NEW.email_validation_score := NULL;
    NEW.email_validated_at := NULL;
    NEW.email_validation_reason := NULL;
    NEW.email_validation_details := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_reset_email_validation ON accounts;

-- Create the trigger
CREATE TRIGGER trigger_reset_email_validation
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION reset_email_validation_on_change();

COMMENT ON FUNCTION reset_email_validation_on_change() IS 'Resets email validation status to unknown when person_email changes';

-- ============================================================================
-- 4. CREATE VIEW FOR ACCOUNTS NEEDING VALIDATION
-- ============================================================================

CREATE OR REPLACE VIEW accounts_needing_validation AS
SELECT
  account_unique_id,
  owner_id,
  name,
  person_email,
  email,
  email_validation_status,
  email_validated_at,
  CASE
    WHEN email_validation_status = 'unknown' OR email_validation_status IS NULL THEN 'never_validated'
    WHEN email_validated_at < NOW() - INTERVAL '90 days' THEN 'expired'
    ELSE 'up_to_date'
  END AS validation_state
FROM accounts
WHERE
  (person_email IS NOT NULL OR email IS NOT NULL)
  AND (
    email_validation_status = 'unknown'
    OR email_validation_status IS NULL
    OR email_validated_at < NOW() - INTERVAL '90 days'
  );

COMMENT ON VIEW accounts_needing_validation IS 'Accounts that need email validation (unknown status or validated > 90 days ago)';
