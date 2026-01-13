-- Migration: Add email_type column to analytics_email_log table
-- This allows distinguishing between admin daily emails and user daily emails

-- Add email_type column
ALTER TABLE analytics_email_log
ADD COLUMN IF NOT EXISTS email_type TEXT DEFAULT 'admin_daily';

-- Add index for querying by email type
CREATE INDEX IF NOT EXISTS idx_analytics_email_log_email_type ON analytics_email_log(email_type);

-- Add comment
COMMENT ON COLUMN analytics_email_log.email_type IS 'Type of analytics email: admin_daily or user_daily';
