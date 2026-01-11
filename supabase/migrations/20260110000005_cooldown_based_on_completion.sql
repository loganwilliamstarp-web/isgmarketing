-- Migration: Update cooldown logic to use completion date instead of enrollment date
-- This ensures the cooldown period starts when an account FINISHES the automation,
-- not when they start it.

CREATE OR REPLACE FUNCTION can_enroll_in_automation(
  p_account_id TEXT,
  p_automation_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_automation RECORD;
  v_last_enrollment RECORD;
  v_enrollment_count INTEGER;
BEGIN
  -- Get automation settings
  SELECT * INTO v_automation FROM automations WHERE id = p_automation_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get last enrollment for this account/automation
  SELECT * INTO v_last_enrollment
  FROM automation_enrollments
  WHERE account_id = p_account_id AND automation_id = p_automation_id
  ORDER BY enrolled_at DESC
  LIMIT 1;

  -- Count total enrollments
  SELECT COUNT(*) INTO v_enrollment_count
  FROM automation_enrollments
  WHERE account_id = p_account_id AND automation_id = p_automation_id;

  -- Check max enrollments
  IF v_automation.max_enrollments IS NOT NULL AND v_enrollment_count >= v_automation.max_enrollments THEN
    RETURN FALSE;
  END IF;

  -- Check cooldown period
  -- Use completion/exit date if available, otherwise fall back to enrolled_at
  -- Priority: completed_at > exited_at > enrolled_at
  -- This means cooldown starts when they FINISH the automation, not when they start
  IF v_last_enrollment IS NOT NULL AND v_automation.enrollment_cooldown_days > 0 THEN
    IF COALESCE(v_last_enrollment.completed_at, v_last_enrollment.exited_at, v_last_enrollment.enrolled_at)
       > NOW() - (v_automation.enrollment_cooldown_days || ' days')::INTERVAL THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check if currently enrolled (active)
  IF v_last_enrollment IS NOT NULL AND v_last_enrollment.status = 'Active' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
