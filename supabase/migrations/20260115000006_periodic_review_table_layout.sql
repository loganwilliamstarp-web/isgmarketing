-- ============================================================================
-- FIX PERIODIC REVIEW TEMPLATE v4 - Table-based layout for email clients
-- ============================================================================
-- Email clients like Outlook don't support display:inline-block reliably
-- Using a single-row table is the most reliable way to display horizontal content
-- ============================================================================

UPDATE email_templates
SET
  body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">

        <h1 style="font-size: 28px; color: #333333; margin: 0 0 20px 0; font-weight: bold;">What did you think?</h1>

        <p style="font-size: 16px; color: #555555; line-height: 1.5; margin: 0 0 30px 0;">
          Hi {{first_name}}, thank you for being a valued customer!<br>
          We would love to hear about your experience with us.
        </p>

        <!-- Rating Box -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color: #f3f4f6; border-radius: 8px; padding: 30px 20px; text-align: center;">

              <h2 style="font-size: 22px; color: #333333; margin: 0 0 10px 0; font-weight: bold;">Rate your experience</h2>
              <p style="font-size: 14px; color: #666666; margin: 0 0 25px 0;">Click on a star to rate us:</p>

              <!-- Stars Table - Single Row -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 5px;"><a href="{{rating_url_1}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_2}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_3}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_4}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_5}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <p style="font-size: 14px; color: #888888; margin: 30px 0 0 0;">
          Your feedback helps us serve you better. Thank you!
        </p>

      </td>
    </tr>
  </table>
</body>
</html>',
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
  body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto;">
    <tr>
      <td style="padding: 40px 20px; text-align: center;">

        <h1 style="font-size: 28px; color: #333333; margin: 0 0 20px 0; font-weight: bold;">What did you think?</h1>

        <p style="font-size: 16px; color: #555555; line-height: 1.5; margin: 0 0 30px 0;">
          Hi {{first_name}}, thank you for being a valued customer!<br>
          We would love to hear about your experience with us.
        </p>

        <!-- Rating Box -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color: #f3f4f6; border-radius: 8px; padding: 30px 20px; text-align: center;">

              <h2 style="font-size: 22px; color: #333333; margin: 0 0 10px 0; font-weight: bold;">Rate your experience</h2>
              <p style="font-size: 14px; color: #666666; margin: 0 0 25px 0;">Click on a star to rate us:</p>

              <!-- Stars Table - Single Row -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 5px;"><a href="{{rating_url_1}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_2}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_3}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_4}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                  <td style="padding: 0 5px;"><a href="{{rating_url_5}}" style="text-decoration: none; color: #6b7280; font-size: 36px; line-height: 1;">&#9733;</a></td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <p style="font-size: 14px; color: #888888; margin: 30px 0 0 0;">
          Your feedback helps us serve you better. Thank you!
        </p>

      </td>
    </tr>
  </table>
</body>
</html>',
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
