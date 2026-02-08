-- Fix survey_email_log_id column type: was INTEGER but email_logs.id is UUID
-- The parseInt() in the star-rating function was producing NaN, so all existing
-- values should be NULL. Safe to drop and re-add as UUID.

ALTER TABLE accounts DROP COLUMN IF EXISTS survey_email_log_id;
ALTER TABLE accounts ADD COLUMN survey_email_log_id UUID REFERENCES email_logs(id);

COMMENT ON COLUMN accounts.survey_email_log_id IS 'ID of the email that generated this survey response';
