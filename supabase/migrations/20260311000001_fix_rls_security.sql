-- Migration: Fix RLS security issues
-- Re-enables RLS on tables that had it disabled and tightens permissive policies
-- Note: All statements use IF EXISTS/IF NOT EXISTS for idempotency

-- ============================================
-- 1. Re-enable RLS on sender_domains
-- ============================================
ALTER TABLE sender_domains ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users (shared resource)
DROP POLICY IF EXISTS "Authenticated users can view sender domains" ON sender_domains;
CREATE POLICY "Authenticated users can view sender domains"
  ON sender_domains FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (edge functions) can manage
DROP POLICY IF EXISTS "Service role can manage sender domains" ON sender_domains;
CREATE POLICY "Service role can manage sender domains"
  ON sender_domains FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2. Re-enable RLS on master_automations
-- ============================================
ALTER TABLE master_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view master automations" ON master_automations;
CREATE POLICY "Authenticated users can view master automations"
  ON master_automations FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage master automations" ON master_automations;
CREATE POLICY "Service role can manage master automations"
  ON master_automations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 3. Re-enable RLS on master_templates
-- ============================================
ALTER TABLE master_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view master templates" ON master_templates;
CREATE POLICY "Authenticated users can view master templates"
  ON master_templates FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can manage master templates" ON master_templates;
CREATE POLICY "Service role can manage master templates"
  ON master_templates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. Tighten email_stats_daily RLS
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view email_stats_daily" ON email_stats_daily;
CREATE POLICY "Users can view own email stats"
  ON email_stats_daily FOR SELECT
  TO authenticated
  USING (
    owner_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_user_id', true) IN (
      SELECT user_id FROM admin_users
    )
    OR current_setting('app.current_user_id', true) IN (
      SELECT user_unique_id FROM users
      WHERE marketing_cloud_agency_admin = true
      AND profile_name = (
        SELECT profile_name FROM users WHERE user_unique_id = email_stats_daily.owner_id
      )
    )
  );

DROP POLICY IF EXISTS "Service role can view all email stats" ON email_stats_daily;
CREATE POLICY "Service role can view all email stats"
  ON email_stats_daily FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 5. Tighten nps_stats_daily RLS
-- ============================================
DROP POLICY IF EXISTS "Authenticated can view nps_stats_daily" ON nps_stats_daily;
CREATE POLICY "Users can view own NPS stats"
  ON nps_stats_daily FOR SELECT
  TO authenticated
  USING (
    owner_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_user_id', true) IN (
      SELECT user_id FROM admin_users
    )
    OR current_setting('app.current_user_id', true) IN (
      SELECT user_unique_id FROM users
      WHERE marketing_cloud_agency_admin = true
      AND profile_name = (
        SELECT profile_name FROM users WHERE user_unique_id = nps_stats_daily.owner_id
      )
    )
  );

DROP POLICY IF EXISTS "Service role can view all NPS stats" ON nps_stats_daily;
CREATE POLICY "Service role can view all NPS stats"
  ON nps_stats_daily FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
