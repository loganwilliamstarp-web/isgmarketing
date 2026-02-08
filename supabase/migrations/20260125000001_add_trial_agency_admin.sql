-- Add trial agency admin flag to user_settings table
-- Trial users who start a trial for their domain become trial agency admins

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS is_trial_agency_admin BOOLEAN DEFAULT FALSE;

-- Note: Index on (profile_name, is_trial_agency_admin) is created in migration
-- 20260127000001_add_profile_name_to_user_settings.sql after profile_name column is added

-- Comment for documentation
COMMENT ON COLUMN user_settings.is_trial_agency_admin IS 'Whether this trial user is the agency admin for their trial domain';
