-- Update sync_master_template_to_users to also update pending scheduled emails
-- When a master template is synced, pending scheduled emails using that template
-- should also be updated with the new content

CREATE OR REPLACE FUNCTION sync_master_template_to_users(p_default_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_master master_templates%ROWTYPE;
  v_updated_count INTEGER;
  v_scheduled_count INTEGER;
BEGIN
  -- Get the master template
  SELECT * INTO v_master FROM master_templates WHERE default_key = p_default_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master template with key % not found', p_default_key;
  END IF;

  -- Update all user copies of the template
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

  -- Update pending scheduled emails that use templates with this default_key
  -- Only update emails that haven't been sent yet (Pending status)
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

  -- Log the update counts (optional, for debugging)
  RAISE NOTICE 'Synced template %: % user templates updated, % scheduled emails updated',
    p_default_key, v_updated_count, v_scheduled_count;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;
