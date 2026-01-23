-- Add trial tracking fields to user_settings table
-- These fields track 30-day trial status for users who don't have marketing_cloud_engagement enabled

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Index for efficient trial status lookups (only on rows that have a trial)
CREATE INDEX IF NOT EXISTS idx_user_settings_trial_ends_at
ON user_settings(trial_ends_at)
WHERE trial_ends_at IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN user_settings.trial_started_at IS 'When the user started their 30-day trial';
COMMENT ON COLUMN user_settings.trial_ends_at IS 'When the trial expires (trial_started_at + 30 days)';
