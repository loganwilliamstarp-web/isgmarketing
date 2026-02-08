-- Add profile_name column to user_settings for trial domain tracking
-- This column is used to group users by their email domain for trial management

-- Add the column
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS profile_name VARCHAR(255);

-- Backfill profile_name from users table for existing user_settings records
UPDATE user_settings us
SET profile_name = u.profile_name
FROM users u
WHERE us.user_id = u.user_unique_id
AND us.profile_name IS NULL;

-- Now create the index for finding trial agency admins by profile
-- (The previous migration tried to create this but failed because the column didn't exist)
DROP INDEX IF EXISTS idx_user_settings_trial_agency_admin;
CREATE INDEX IF NOT EXISTS idx_user_settings_trial_agency_admin
ON user_settings(profile_name, is_trial_agency_admin)
WHERE is_trial_agency_admin = TRUE;

-- Comment for documentation
COMMENT ON COLUMN user_settings.profile_name IS 'The agency/profile name for grouping users (usually derived from email domain for trials)';
