-- ============================================================================
-- FIX PERIODIC REVIEW TEMPLATE v3 - Simple Email-Client Compatible Design
-- ============================================================================
-- Simplified HTML that works across all email clients
-- - Inline table for horizontal star layout
-- - All styles inline (no CSS classes)
-- - Simple structure without nested tables
-- ============================================================================

UPDATE email_templates
SET
  body_html = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="font-size: 24px; color: #333333; text-align: center; margin-bottom: 20px;">What did you think?</h1>

  <p style="font-size: 16px; color: #555555; text-align: center; margin-bottom: 30px;">
    Hi {{first_name}}, thank you for being a valued customer!<br>
    We would love to hear about your experience with us.
  </p>

  <div style="background-color: #f3f4f6; border-radius: 8px; padding: 30px; margin-bottom: 30px; text-align: center;">
    <h2 style="font-size: 20px; color: #333333; margin: 0 0 10px 0;">Rate your experience</h2>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0;">Click on a star to rate us:</p>

    <div style="font-size: 0;">
      <a href="{{rating_url_1}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_2}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_3}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_4}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_5}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
    </div>
  </div>

  <p style="font-size: 14px; color: #777777; text-align: center;">
    Your feedback helps us serve you better. Thank you!
  </p>
</div>',
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
  body_html = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="font-size: 24px; color: #333333; text-align: center; margin-bottom: 20px;">What did you think?</h1>

  <p style="font-size: 16px; color: #555555; text-align: center; margin-bottom: 30px;">
    Hi {{first_name}}, thank you for being a valued customer!<br>
    We would love to hear about your experience with us.
  </p>

  <div style="background-color: #f3f4f6; border-radius: 8px; padding: 30px; margin-bottom: 30px; text-align: center;">
    <h2 style="font-size: 20px; color: #333333; margin: 0 0 10px 0;">Rate your experience</h2>
    <p style="font-size: 14px; color: #666666; margin: 0 0 20px 0;">Click on a star to rate us:</p>

    <div style="font-size: 0;">
      <a href="{{rating_url_1}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_2}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_3}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_4}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
      <a href="{{rating_url_5}}" style="display: inline-block; text-decoration: none; padding: 0 8px;"><span style="font-size: 40px; color: #6b7280;">&#9733;</span></a>
    </div>
  </div>

  <p style="font-size: 14px; color: #777777; text-align: center;">
    Your feedback helps us serve you better. Thank you!
  </p>
</div>',
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
