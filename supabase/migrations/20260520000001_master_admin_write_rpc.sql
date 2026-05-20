-- Migration: Gated write access to master_automations / master_templates
--
-- Background: 20260311000001_fix_rls_security re-enabled RLS on these tables
-- but only granted SELECT to `authenticated` and ALL to `service_role`. The
-- web app talks to Supabase with the anon key (no service role), so every
-- INSERT/UPDATE was silently rejected by RLS -- e.g. "Create Master Automation"
-- appeared to do nothing.
--
-- Fix: keep RLS locked down (the app role still cannot write directly) and
-- route writes through SECURITY DEFINER functions that verify the caller is an
-- admin (present in admin_users) before touching the table.

-- ----------------------------------------------------------------------------
-- master_automations: create
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

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- master_automations: update (upsert) + sync to user copies
-- Mirrors the previous adminService.updateMasterAutomation behaviour: create
-- the master row if it does not exist yet, then push changes to user copies.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_update_master_automation(
  p_user_id TEXT,
  p_default_key TEXT,
  p_updates JSONB
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

  IF EXISTS (SELECT 1 FROM master_automations WHERE default_key = p_default_key) THEN
    UPDATE master_automations SET
      name        = COALESCE(p_updates->>'name', name),
      description = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE description END,
      category    = CASE WHEN p_updates ? 'category' THEN p_updates->>'category' ELSE category END,
      send_time   = CASE WHEN p_updates ? 'send_time' THEN (p_updates->>'send_time')::time ELSE send_time END,
      timezone    = CASE WHEN p_updates ? 'timezone' THEN p_updates->>'timezone' ELSE timezone END,
      frequency   = CASE WHEN p_updates ? 'frequency' THEN p_updates->>'frequency' ELSE frequency END,
      max_enrollments = CASE WHEN p_updates ? 'max_enrollments' THEN (p_updates->>'max_enrollments')::int ELSE max_enrollments END,
      enrollment_cooldown_days = CASE WHEN p_updates ? 'enrollment_cooldown_days' THEN (p_updates->>'enrollment_cooldown_days')::int ELSE enrollment_cooldown_days END,
      distribute_evenly = CASE WHEN p_updates ? 'distribute_evenly' THEN (p_updates->>'distribute_evenly')::boolean ELSE distribute_evenly END,
      filter_config = CASE WHEN p_updates ? 'filter_config' THEN p_updates->'filter_config' ELSE filter_config END,
      nodes       = CASE WHEN p_updates ? 'nodes' THEN p_updates->'nodes' ELSE nodes END,
      updated_at  = NOW()
    WHERE default_key = p_default_key
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO master_automations (
      default_key, name, description, category, send_time, timezone,
      frequency, filter_config, nodes
    )
    VALUES (
      p_default_key,
      COALESCE(p_updates->>'name', p_default_key),
      p_updates->>'description',
      p_updates->>'category',
      COALESCE((p_updates->>'send_time')::time, '10:00'),
      COALESCE(p_updates->>'timezone', 'America/Chicago'),
      COALESCE(p_updates->>'frequency', 'Daily'),
      COALESCE(p_updates->'filter_config', '{}'::jsonb),
      COALESCE(p_updates->'nodes', '[]'::jsonb)
    )
    RETURNING * INTO v_row;
  END IF;

  -- Push the master changes down to every user's default copy.
  PERFORM sync_master_automation_to_users(p_default_key);

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- master_templates: create
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

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- master_templates: update
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_update_master_template(
  p_user_id TEXT,
  p_default_key TEXT,
  p_updates JSONB
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

  UPDATE master_templates SET
    name         = COALESCE(p_updates->>'name', name),
    subject      = COALESCE(p_updates->>'subject', subject),
    body_html    = COALESCE(p_updates->>'body_html', body_html),
    body_text    = CASE WHEN p_updates ? 'body_text' THEN p_updates->>'body_text' ELSE body_text END,
    category     = CASE WHEN p_updates ? 'category' THEN p_updates->>'category' ELSE category END,
    merge_fields = CASE WHEN p_updates ? 'merge_fields' THEN p_updates->'merge_fields' ELSE merge_fields END,
    version      = COALESCE((p_updates->>'version')::int, version),
    updated_at   = NOW()
  WHERE default_key = p_default_key
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Master template with key % not found', p_default_key;
  END IF;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- Grants: the app calls these as the anon / authenticated role.
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin_create_master_automation(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_update_master_automation(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_create_master_template(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_update_master_template(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
