-- Add trial agency admin flag to user_settings table
-- Trial users who start a trial for their domain become trial agency admins

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS is_trial_agency_admin BOOLEAN DEFAULT FALSE;

-- Index for finding trial agency admins by profile
CREATE INDEX IF NOT EXISTS idx_user_settings_trial_agency_admin
ON user_settings(profile_name, is_trial_agency_admin)
WHERE is_trial_agency_admin = TRUE;

-- Comment for documentation
COMMENT ON COLUMN user_settings.is_trial_agency_admin IS 'Whether this trial user is the agency admin for their trial domain';
