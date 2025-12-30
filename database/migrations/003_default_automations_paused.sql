-- ============================================
-- MIGRATION: Default Automations Start as Paused
-- ============================================
-- Purpose: Ensure all default automations start as 'paused' instead of 'Active'
--          Users must explicitly activate automations they want to use
-- ============================================

-- 1. Update the column default to 'paused'
ALTER TABLE automations
ALTER COLUMN status SET DEFAULT 'paused';

-- 2. Update existing default automations from 'Active' to 'paused'
UPDATE automations
SET status = 'paused',
    updated_at = NOW()
WHERE is_default = TRUE
  AND status = 'Active';

-- 3. Recreate the create_default_automations_for_user function with 'paused' status
CREATE OR REPLACE FUNCTION create_default_automations_for_user(p_user_id TEXT)
RETURNS void AS $$
DECLARE
  v_template_id INTEGER;
BEGIN

  -- Automation 1: Welcome Email - Personal Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'welcome_personal',
    'Welcome Email - Personal Lines',
    'Send welcome email to new personal lines customers 15 days after becoming a customer',
    'Onboarding', 'paused', '10:00', 'America/Chicago', 'Daily',
    1, 0,  -- Can only enroll 1 time
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_type", "operator": "equals", "value": "Personal"},
          {"field": "customer_since", "operator": "equals_days_ago", "value": 15}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "New Personal Customer (15 days)"},
      {"id": "node-1", "type": "send_email", "title": "Send Welcome Email", "config": {"templateKey": "welcome_personal"}}
    ]'::jsonb
  );

  -- Automation 2: Welcome Email - Commercial Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'welcome_commercial',
    'Welcome Email - Commercial Lines',
    'Send welcome email to new commercial customers 7 days after becoming a customer',
    'Onboarding', 'paused', '10:00', 'America/Chicago', 'Daily',
    1, 0,  -- Can only enroll 1 time
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_type", "operator": "equals", "value": "Commercial"},
          {"field": "customer_since", "operator": "equals_days_ago", "value": 7}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "New Commercial Customer (7 days)"},
      {"id": "node-1", "type": "send_email", "title": "Send Welcome Email", "config": {"templateKey": "welcome_commercial"}}
    ]'::jsonb
  );

  -- Automation 3: Renewal Email - Personal Lines - No Cross Sale
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewal_personal_no_cross',
    'Renewal Email - Personal Lines - No Cross Sale',
    'Renewal reminder for personal lines customers who have both auto AND home/renters (no cross-sell opportunity)',
    'Retention', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,  -- Re-enroll after 90 days
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_expiration_date", "operator": "equals_days_from_now", "value": 45},
          {"field": "policy_class", "operator": "equals", "value": "Personal"},
          {"field": "has_policy_type", "operator": "equals", "value": "Personal Auto"},
          {"field": "has_policy_type", "operator": "in", "value": ["Homeowners", "Renters"]}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Policy Expiring in 45 Days"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Email", "config": {"templateKey": "renewal_personal_no_cross"}},
      {"id": "node-2", "type": "delay", "title": "Wait 15 days", "config": {"days": 15}},
      {"id": "node-3", "type": "condition", "title": "Email Opened?", "config": {"type": "email_opened", "emailNodeId": "node-1"}, "branches": {
        "yes": [],
        "no": [{"id": "node-4", "type": "send_email", "title": "Send Reminder", "config": {"templateKey": "renewal_reminder"}}]
      }}
    ]'::jsonb
  );

  -- Automation 4: Renewal Email - Personal Lines - Cross Sale
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewal_personal_cross',
    'Renewal Email - Personal Lines - Cross Sale',
    'Renewal reminder for personal lines customers who have only ONE of auto/home/renters (cross-sell opportunity)',
    'Retention', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_expiration_date", "operator": "equals_days_from_now", "value": 45},
          {"field": "policy_class", "operator": "equals", "value": "Personal"},
          {"field": "has_only_one_of", "operator": "in", "value": ["Personal Auto", "Homeowners", "Renters"]}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Policy Expiring in 45 Days (Cross-Sell)"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal + Cross-Sell Email", "config": {"templateKey": "renewal_personal_cross"}},
      {"id": "node-2", "type": "delay", "title": "Wait 15 days", "config": {"days": 15}},
      {"id": "node-3", "type": "condition", "title": "Email Opened?", "config": {"type": "email_opened", "emailNodeId": "node-1"}, "branches": {
        "yes": [],
        "no": [{"id": "node-4", "type": "send_email", "title": "Send Reminder", "config": {"templateKey": "renewal_reminder"}}]
      }}
    ]'::jsonb
  );

  -- Automation 5: Renewal Email - Commercial Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewal_commercial',
    'Renewal Email - Commercial Lines',
    'Renewal reminder for commercial lines customers 30 days before expiration',
    'Retention', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_expiration_date", "operator": "equals_days_from_now", "value": 30},
          {"field": "policy_class", "operator": "equals", "value": "Commercial"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Commercial Policy Expiring in 30 Days"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Email", "config": {"templateKey": "renewal_commercial"}},
      {"id": "node-2", "type": "delay", "title": "Wait 10 days", "config": {"days": 10}},
      {"id": "node-3", "type": "condition", "title": "Email Opened?", "config": {"type": "email_opened", "emailNodeId": "node-1"}, "branches": {
        "yes": [],
        "no": [{"id": "node-4", "type": "send_email", "title": "Send Reminder", "config": {"templateKey": "renewal_reminder"}}]
      }}
    ]'::jsonb
  );

  -- Automation 6: Policy Renewed - Personal Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewed_personal',
    'Policy Renewed - Personal Lines',
    'Send confirmation email when personal lines policy renews',
    'Retention', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_term", "operator": "equals", "value": "Renewal"},
          {"field": "policy_effective_date", "operator": "equals_days_ago", "value": 3},
          {"field": "policy_class", "operator": "equals", "value": "Personal"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Personal Policy Renewed (3 days ago)"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Confirmation", "config": {"templateKey": "renewed_personal"}}
    ]'::jsonb
  );

  -- Automation 7: Policy Renewed - Commercial Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewed_commercial',
    'Policy Renewed - Commercial Lines',
    'Send confirmation email when commercial policy renews',
    'Retention', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_term", "operator": "equals", "value": "Renewal"},
          {"field": "policy_effective_date", "operator": "equals_days_ago", "value": 3},
          {"field": "policy_class", "operator": "equals", "value": "Commercial"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Commercial Policy Renewed (3 days ago)"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Confirmation", "config": {"templateKey": "renewed_commercial"}}
    ]'::jsonb
  );

  -- Automation 8: Midterm Cross Sale - Personal Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'midterm_cross_personal',
    'Midterm Cross Sale - Personal Lines',
    'Cross-sell opportunity for customers with only one policy type, triggered mid-term',
    'Cross-Sell', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 45,
    '{
      "groups": [
        {
          "rules": [
            {"field": "active_policy_type", "operator": "is", "value": "Home"},
            {"field": "active_policy_type", "operator": "is_not", "value": "Auto"},
            {"field": "policy_term", "operator": "is", "value": "12"},
            {"field": "policy_expiration", "operator": "more_than_days_future", "value": "170"},
            {"field": "policy_expiration", "operator": "less_than_days_future", "value": "190"}
          ]
        },
        {
          "rules": [
            {"field": "active_policy_type", "operator": "is", "value": "Auto"},
            {"field": "active_policy_type", "operator": "is_not_any", "value": "Home,Renters"},
            {"field": "policy_term", "operator": "is", "value": "12"},
            {"field": "policy_expiration", "operator": "more_than_days_future", "value": "170"},
            {"field": "policy_expiration", "operator": "less_than_days_future", "value": "180"}
          ]
        },
        {
          "rules": [
            {"field": "active_policy_type", "operator": "is", "value": "Auto"},
            {"field": "active_policy_type", "operator": "is_not_any", "value": "Home,Renters"},
            {"field": "policy_term", "operator": "is", "value": "6"},
            {"field": "policy_expiration", "operator": "more_than_days_future", "value": "80"},
            {"field": "policy_expiration", "operator": "less_than_days_future", "value": "90"}
          ]
        }
      ]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Mid-Term Cross-Sell Opportunity"},
      {"id": "node-1", "type": "send_email", "title": "Send Cross-Sell Email", "config": {"templateKey": "midterm_cross_personal"}}
    ]'::jsonb
  );

  -- Automation 9: Prospect Email - All Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'prospect_all',
    'Prospect Email - All Lines',
    'Re-engage prospects who never became customers',
    'Win-Back', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 365, TRUE,  -- Re-enroll every 365 days, distribute evenly
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_status", "operator": "equals", "value": "prospect"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Prospect Account"},
      {"id": "node-1", "type": "send_email", "title": "Send Prospect Email", "config": {"templateKey": "prospect_all"}}
    ]'::jsonb
  );

  -- Automation 10: Prior Customer Email - All Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'prior_customer_all',
    'Prior Customer Email - All Lines',
    'Win-back campaign for prior customers',
    'Win-Back', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 365, TRUE,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_status", "operator": "equals", "value": "prior_customer"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Prior Customer Account"},
      {"id": "node-1", "type": "send_email", "title": "Send Win-Back Email", "config": {"templateKey": "prior_customer_all"}}
    ]'::jsonb
  );

  -- Automation 11: Periodic Review Touch
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'periodic_review',
    'Periodic Review Touch',
    'Annual check-in for customers who haven''t provided feedback',
    'Engagement', 'paused', '10:00', 'America/Chicago', 'Daily',
    NULL, 365, TRUE,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "survey_feedback_pc", "operator": "is_blank", "value": null},
          {"field": "survey_stars", "operator": "is_blank", "value": null}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "No Feedback Recorded"},
      {"id": "node-1", "type": "send_email", "title": "Send Review Request", "config": {"templateKey": "periodic_review"}}
    ]'::jsonb
  );

END;
$$ LANGUAGE plpgsql;

-- 4. Log the migration
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM automations
  WHERE is_default = TRUE AND status = 'paused';

  RAISE NOTICE 'Migration complete. % default automations now in paused status.', updated_count;
END $$;
