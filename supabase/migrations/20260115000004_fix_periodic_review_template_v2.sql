-- ============================================================================
-- FIX PERIODIC REVIEW TEMPLATE v2 - Proper Styling and Merge Fields
-- ============================================================================
-- Fixes:
-- 1. Use correct merge field format: {{first_name}} not {{ account.primary_contact_first_name }}
-- 2. Use correct rating URL format: {{rating_url_1}} not {{ rating_url_1 }}
-- 3. Better email design with horizontal stars in a styled container
-- ============================================================================

UPDATE email_templates
SET
  body_html = '<!-- Periodic Review Email Template -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
  <tr>
    <td style="padding: 20px 0;">

      <!-- Header -->
      <h1 style="font-family: Arial, sans-serif; font-size: 28px; font-weight: bold; color: #333333; text-align: center; margin: 0 0 20px 0;">
        What did you think?
      </h1>

      <!-- Intro Text -->
      <p style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #555555; text-align: center; margin: 0 0 30px 0;">
        Hi {{first_name}}, thank you for being a valued customer!<br>
        We would love to hear about your experience with us.
      </p>

      <!-- Star Rating Box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #e8f4fc; border-radius: 8px; margin: 0 0 30px 0;">
        <tr>
          <td style="padding: 30px 20px; text-align: center;">

            <h2 style="font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; color: #333333; margin: 0 0 15px 0;">
              Rate your experience
            </h2>

            <p style="font-family: Arial, sans-serif; font-size: 14px; color: #666666; margin: 0 0 20px 0;">
              Click on the number of stars you would like to give us:
            </p>

            <!-- Stars Row -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
              <tr>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_1}}" style="text-decoration: none; display: inline-block;" title="1 Star">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_2}}" style="text-decoration: none; display: inline-block;" title="2 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_3}}" style="text-decoration: none; display: inline-block;" title="3 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_4}}" style="text-decoration: none; display: inline-block;" title="4 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_5}}" style="text-decoration: none; display: inline-block;" title="5 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

      <!-- Footer Text -->
      <p style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #777777; text-align: center; margin: 0;">
        Your feedback helps us serve you better. Thank you!
      </p>

    </td>
  </tr>
</table>',
  body_text = 'What did you think?

Hi {{first_name}}, thank you for being a valued customer!
We would love to hear about your experience with us.

Rate your experience by clicking one of the links below:

1 Star: {{rating_url_1}}
2 Stars: {{rating_url_2}}
3 Stars: {{rating_url_3}}
4 Stars: {{rating_url_4}}
5 Stars: {{rating_url_5}}

Your feedback helps us serve you better. Thank you!',
  name = 'Periodic Review - Star Rating',
  subject = 'Hi {{first_name}}, How Are We Doing?',
  merge_fields = '["{{first_name}}", "{{rating_url_1}}", "{{rating_url_2}}", "{{rating_url_3}}", "{{rating_url_4}}", "{{rating_url_5}}"]'::jsonb,
  updated_at = NOW()
WHERE default_key = 'periodic_review';

-- Also update master_templates if it exists
UPDATE master_templates
SET
  body_html = '<!-- Periodic Review Email Template -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
  <tr>
    <td style="padding: 20px 0;">

      <!-- Header -->
      <h1 style="font-family: Arial, sans-serif; font-size: 28px; font-weight: bold; color: #333333; text-align: center; margin: 0 0 20px 0;">
        What did you think?
      </h1>

      <!-- Intro Text -->
      <p style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #555555; text-align: center; margin: 0 0 30px 0;">
        Hi {{first_name}}, thank you for being a valued customer!<br>
        We would love to hear about your experience with us.
      </p>

      <!-- Star Rating Box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #e8f4fc; border-radius: 8px; margin: 0 0 30px 0;">
        <tr>
          <td style="padding: 30px 20px; text-align: center;">

            <h2 style="font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; color: #333333; margin: 0 0 15px 0;">
              Rate your experience
            </h2>

            <p style="font-family: Arial, sans-serif; font-size: 14px; color: #666666; margin: 0 0 20px 0;">
              Click on the number of stars you would like to give us:
            </p>

            <!-- Stars Row -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
              <tr>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_1}}" style="text-decoration: none; display: inline-block;" title="1 Star">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_2}}" style="text-decoration: none; display: inline-block;" title="2 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_3}}" style="text-decoration: none; display: inline-block;" title="3 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_4}}" style="text-decoration: none; display: inline-block;" title="4 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
                <td style="padding: 0 6px;">
                  <a href="{{rating_url_5}}" style="text-decoration: none; display: inline-block;" title="5 Stars">
                    <span style="font-size: 42px; color: #6b7280; line-height: 1;">&#9733;</span>
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

      <!-- Footer Text -->
      <p style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #777777; text-align: center; margin: 0;">
        Your feedback helps us serve you better. Thank you!
      </p>

    </td>
  </tr>
</table>',
  body_text = 'What did you think?

Hi {{first_name}}, thank you for being a valued customer!
We would love to hear about your experience with us.

Rate your experience by clicking one of the links below:

1 Star: {{rating_url_1}}
2 Stars: {{rating_url_2}}
3 Stars: {{rating_url_3}}
4 Stars: {{rating_url_4}}
5 Stars: {{rating_url_5}}

Your feedback helps us serve you better. Thank you!',
  name = 'Periodic Review - Star Rating',
  subject = 'Hi {{first_name}}, How Are We Doing?',
  merge_fields = '["{{first_name}}", "{{rating_url_1}}", "{{rating_url_2}}", "{{rating_url_3}}", "{{rating_url_4}}", "{{rating_url_5}}"]'::jsonb,
  updated_at = NOW()
WHERE default_key = 'periodic_review';

-- Log the migration
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count FROM email_templates WHERE default_key = 'periodic_review';
  RAISE NOTICE 'Updated % periodic_review template(s) with proper styling and merge fields', updated_count;
END $$;
