-- Migration: Sync user copies when a master is CREATED (not just updated)
--
-- Background: admin_update_master_automation already force-syncs to users, and
-- both master tables have AFTER UPDATE triggers that sync. But the CREATE path
-- (admin_create_master_automation / admin_create_master_template) did neither,
-- and the sync triggers do not fire on INSERT. A freshly created master template
-- therefore had no per-user email_templates copy. At scheduling time the
-- automation's send_email node resolves its templateKey against the user's
-- email_templates (owner_id + default_key); with no copy it resolves to nothing,
-- the whole automation is skipped ("No templates found ... check templateKey
-- mappings"), and no emails get scheduled for anyone.
--
-- Fix: have both create RPCs propagate to user copies immediately after insert,
-- mirroring the update path. sync_*_to_users is idempotent (UPDATE existing +
-- INSERT missing), so this is safe even if a later "Sync to Users" runs.

-- ----------------------------------------------------------------------------
-- automations.last_error: surface scheduling failures in the UI
--
-- The app (src/services/automations.js) and the process-scheduled-emails edge
-- function both write automations.last_error, but the column was never created,
-- so those writes silently errored and failures stayed invisible. Add it.
-- ----------------------------------------------------------------------------
ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_error TEXT;

-- ----------------------------------------------------------------------------
-- master_automations: create + sync to user copies
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_create_master_automation(
  p_user_id TEXT,
  p_automation JSONB
)
RETURNS master_automations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row master_automations;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Not authorized: % is not an admin', p_user_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO master_automations (
    default_key, name, description, category, send_time, timezone,
    frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly,
    filter_config, nodes, version
  )
  VALUES (
    p_automation->>'default_key',
    p_automation->>'name',
    p_automation->>'description',
    p_automation->>'category',
    COALESCE((p_automation->>'send_time')::time, '10:00'),
    COALESCE(p_automation->>'timezone', 'America/Chicago'),
    COALESCE(p_automation->>'frequency', 'Daily'),
    COALESCE((p_automation->>'max_enrollments')::int, 1),
    COALESCE((p_automation->>'enrollment_cooldown_days')::int, 0),
    COALESCE((p_automation->>'distribute_evenly')::boolean, false),
    COALESCE(p_automation->'filter_config', '{}'::jsonb),
    COALESCE(p_automation->'nodes', '[]'::jsonb),
    COALESCE((p_automation->>'version')::int, 1)
  )
  RETURNING * INTO v_row;

  -- Seed a (paused) copy for every user, same as the update path does.
  PERFORM sync_master_automation_to_users(v_row.default_key);

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- master_templates: create + sync to user copies
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_create_master_template(
  p_user_id TEXT,
  p_template JSONB
)
RETURNS master_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row master_templates;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Not authorized: % is not an admin', p_user_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO master_templates (
    default_key, name, subject, body_html, body_text, category,
    merge_fields, version
  )
  VALUES (
    p_template->>'default_key',
    p_template->>'name',
    p_template->>'subject',
    COALESCE(p_template->>'body_html', ''),
    p_template->>'body_text',
    p_template->>'category',
    COALESCE(p_template->'merge_fields', '[]'::jsonb),
    COALESCE((p_template->>'version')::int, 1)
  )
  RETURNING * INTO v_row;

  -- Without this, the new template exists only as a master row; users have no
  -- email_templates copy and any automation referencing it silently won't send.
  PERFORM sync_master_template_to_users(v_row.default_key);

  RETURN v_row;
END;
$$;
