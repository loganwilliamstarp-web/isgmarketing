-- Migration: Sync should create user copies, not only update them
--
-- Background: sync_master_automation_to_users / sync_master_template_to_users
-- only ran an UPDATE against existing user copies (matched by default_key).
-- A newly-created master has no copies in any user's account yet, so "Sync to
-- Users" updated 0 rows and appeared to do nothing.
--
-- Fix: each function now also INSERTs a copy for every user that doesn't have
-- one. Existing copies are still updated in place (preserving each user's
-- status), so behaviour is unchanged for masters that were already seeded.

-- ----------------------------------------------------------------------------
-- sync_master_automation_to_users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_master_automation_to_users(p_default_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_master master_automations%ROWTYPE;
  v_updated_count INTEGER;
  v_inserted_count INTEGER;
BEGIN
  SELECT * INTO v_master FROM master_automations WHERE default_key = p_default_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master automation with key % not found', p_default_key;
  END IF;

  -- Update existing user copies (keep each user's status intact)
  UPDATE automations
  SET
    name = v_master.name,
    description = v_master.description,
    category = v_master.category,
    send_time = v_master.send_time,
    timezone = v_master.timezone,
    frequency = v_master.frequency,
    max_enrollments = v_master.max_enrollments,
    enrollment_cooldown_days = v_master.enrollment_cooldown_days,
    distribute_evenly = v_master.distribute_evenly,
    filter_config = v_master.filter_config,
    nodes = v_master.nodes,
    updated_at = NOW()
  WHERE default_key = p_default_key
    AND is_default = TRUE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Create a copy for every user that doesn't have one yet (paused by default;
  -- each user activates it themselves)
  INSERT INTO automations (
    owner_id, is_default, default_key, name, description, category, status,
    send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days,
    distribute_evenly, filter_config, nodes
  )
  SELECT DISTINCT
    u.user_unique_id, TRUE, v_master.default_key, v_master.name,
    v_master.description, v_master.category, 'paused', v_master.send_time,
    v_master.timezone, v_master.frequency, v_master.max_enrollments,
    v_master.enrollment_cooldown_days, v_master.distribute_evenly,
    v_master.filter_config, v_master.nodes
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM automations a
    WHERE a.owner_id = u.user_unique_id
      AND a.default_key = p_default_key
  );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_updated_count + v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- sync_master_template_to_users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_master_template_to_users(p_default_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_master master_templates%ROWTYPE;
  v_updated_count INTEGER;
  v_inserted_count INTEGER;
  v_scheduled_count INTEGER;
BEGIN
  SELECT * INTO v_master FROM master_templates WHERE default_key = p_default_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master template with key % not found', p_default_key;
  END IF;

  -- Update existing user copies
  UPDATE email_templates
  SET
    name = v_master.name,
    subject = v_master.subject,
    body_html = v_master.body_html,
    body_text = v_master.body_text,
    category = v_master.category,
    merge_fields = v_master.merge_fields,
    updated_at = NOW()
  WHERE default_key = p_default_key
    AND is_default = TRUE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Create a copy for every user that doesn't have one yet
  INSERT INTO email_templates (
    owner_id, is_default, default_key, name, subject, body_html, body_text,
    category, merge_fields
  )
  SELECT DISTINCT
    u.user_unique_id, TRUE, v_master.default_key, v_master.name, v_master.subject,
    v_master.body_html, v_master.body_text, v_master.category, v_master.merge_fields
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM email_templates et
    WHERE et.owner_id = u.user_unique_id
      AND et.default_key = p_default_key
  );

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- Update pending scheduled emails that use this template
  UPDATE scheduled_emails se
  SET
    subject = v_master.subject,
    body_html = v_master.body_html,
    body_text = v_master.body_text,
    updated_at = NOW()
  FROM email_templates et
  WHERE se.template_id = et.id
    AND et.default_key = p_default_key
    AND et.is_default = TRUE
    AND se.status = 'Pending';

  GET DIAGNOSTICS v_scheduled_count = ROW_COUNT;

  RAISE NOTICE 'Synced template %: % updated, % created, % scheduled emails updated',
    p_default_key, v_updated_count, v_inserted_count, v_scheduled_count;

  RETURN v_updated_count + v_inserted_count;
END;
$$ LANGUAGE plpgsql;
