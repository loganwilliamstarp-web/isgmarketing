-- ============================================================================
-- STAR RATING FEATURE - Complete Migration
-- ============================================================================
-- This migration adds all the necessary fields and updates for the star rating
-- feature in periodic review emails.
-- ============================================================================

-- ============================================================================
-- 1. USER SETTINGS - Add Google Review fields
-- ============================================================================

-- Add the google_review_link column
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS google_review_link TEXT;

-- Add the google_review_min_stars column (minimum stars to redirect to Google Review)
-- Default is 5 (only 5-star ratings go to Google Review)
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS google_review_min_stars INTEGER DEFAULT 5
  CHECK (google_review_min_stars IS NULL OR (google_review_min_stars >= 1 AND google_review_min_stars <= 5));

-- Add comments
COMMENT ON COLUMN user_settings.google_review_link IS 'Google Review link for the agency, used in star rating emails';
COMMENT ON COLUMN user_settings.google_review_min_stars IS 'Minimum star rating (1-5) required to redirect to Google Review. Default is 5.';

-- ============================================================================
-- 2. ACCOUNTS - Add survey/rating fields
-- ============================================================================

-- Add survey_stars column (1-5 star rating)
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS survey_stars INTEGER
  CHECK (survey_stars IS NULL OR (survey_stars >= 1 AND survey_stars <= 5));

-- Add survey_feedback_text for customers who leave feedback (especially low ratings)
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS survey_feedback_text TEXT;

-- Add survey_completed_at timestamp
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMPTZ;

-- Add survey_email_log_id to track which email triggered the survey
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS survey_email_log_id INTEGER REFERENCES email_logs(id);

-- Add comments
COMMENT ON COLUMN accounts.survey_stars IS 'Customer star rating (1-5) from periodic review email';
COMMENT ON COLUMN accounts.survey_feedback_text IS 'Optional feedback text from customer, especially for low ratings';
COMMENT ON COLUMN accounts.survey_completed_at IS 'Timestamp when customer submitted their rating';
COMMENT ON COLUMN accounts.survey_email_log_id IS 'ID of the email that generated this survey response';

-- Create index for filtering accounts by survey status
CREATE INDEX IF NOT EXISTS idx_accounts_survey_stars ON accounts(survey_stars) WHERE survey_stars IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_survey_completed ON accounts(survey_completed_at) WHERE survey_completed_at IS NOT NULL;

-- ============================================================================
-- 3. UPDATE PERIODIC REVIEW MASTER TEMPLATE
-- ============================================================================

-- Update the master template with star rating buttons
UPDATE master_templates
SET
  name = 'Periodic Review - Star Rating',
  subject = 'Hi {{ account.primary_contact_first_name }}, How Are We Doing?',
  body_html = '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>We value your feedback and would love to hear about your experience with us!</p>

<p><strong>How would you rate your experience?</strong></p>

<table align="center" cellpadding="0" cellspacing="0" style="margin: 30px auto;">
  <tr>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_1 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="1 Star - Poor">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_2 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="2 Stars - Fair">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_3 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="3 Stars - Good">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_4 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="4 Stars - Very Good">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_5 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="5 Stars - Excellent">&#9733;</a>
    </td>
  </tr>
</table>

<p style="text-align: center; color: #666; font-size: 12px;">Click a star to rate us</p>

<p>Your feedback helps us serve you better. Thank you for being a valued customer!</p>',
  merge_fields = '["{{ account.primary_contact_first_name }}", "{{ rating_url_1 }}", "{{ rating_url_2 }}", "{{ rating_url_3 }}", "{{ rating_url_4 }}", "{{ rating_url_5 }}"]'::jsonb,
  updated_at = NOW()
WHERE default_key = 'periodic_review';

-- Also sync to all user copies of this template
UPDATE email_templates
SET
  name = 'Periodic Review - Star Rating',
  subject = 'Hi {{ account.primary_contact_first_name }}, How Are We Doing?',
  body_html = '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>We value your feedback and would love to hear about your experience with us!</p>

<p><strong>How would you rate your experience?</strong></p>

<table align="center" cellpadding="0" cellspacing="0" style="margin: 30px auto;">
  <tr>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_1 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="1 Star - Poor">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_2 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="2 Stars - Fair">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_3 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="3 Stars - Good">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_4 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="4 Stars - Very Good">&#9733;</a>
    </td>
    <td style="padding: 0 8px;">
      <a href="{{ rating_url_5 }}" style="text-decoration: none; font-size: 36px; color: #fbbf24;" title="5 Stars - Excellent">&#9733;</a>
    </td>
  </tr>
</table>

<p style="text-align: center; color: #666; font-size: 12px;">Click a star to rate us</p>

<p>Your feedback helps us serve you better. Thank you for being a valued customer!</p>',
  merge_fields = '["{{ account.primary_contact_first_name }}", "{{ rating_url_1 }}", "{{ rating_url_2 }}", "{{ rating_url_3 }}", "{{ rating_url_4 }}", "{{ rating_url_5 }}"]'::jsonb,
  updated_at = NOW()
WHERE default_key = 'periodic_review' AND is_default = TRUE;
