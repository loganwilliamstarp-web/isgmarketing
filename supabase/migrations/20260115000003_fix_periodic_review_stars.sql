-- ============================================================================
-- FIX PERIODIC REVIEW TEMPLATE - Star Rating Characters
-- ============================================================================
-- This migration fixes the star rating characters in the periodic review
-- email template. The &#9733; HTML entities may have been corrupted when
-- edited through the UI, showing as ##### instead of stars.
-- ============================================================================

-- Update ALL email_templates that have the periodic_review default_key
-- This ensures both master templates and user-specific copies get fixed

UPDATE email_templates
SET
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
  name = 'Periodic Review - Star Rating',
  subject = 'Hi {{ account.primary_contact_first_name }}, How Are We Doing?',
  merge_fields = '["{{ account.primary_contact_first_name }}", "{{ rating_url_1 }}", "{{ rating_url_2 }}", "{{ rating_url_3 }}", "{{ rating_url_4 }}", "{{ rating_url_5 }}"]'::jsonb,
  updated_at = NOW()
WHERE default_key = 'periodic_review';

-- Also update master_templates if it exists
UPDATE master_templates
SET
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
  name = 'Periodic Review - Star Rating',
  subject = 'Hi {{ account.primary_contact_first_name }}, How Are We Doing?',
  merge_fields = '["{{ account.primary_contact_first_name }}", "{{ rating_url_1 }}", "{{ rating_url_2 }}", "{{ rating_url_3 }}", "{{ rating_url_4 }}", "{{ rating_url_5 }}"]'::jsonb,
  updated_at = NOW()
WHERE default_key = 'periodic_review';

-- Log the migration
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count FROM email_templates WHERE default_key = 'periodic_review';
  RAISE NOTICE 'Updated % periodic_review template(s) with star rating HTML entities', updated_count;
END $$;
