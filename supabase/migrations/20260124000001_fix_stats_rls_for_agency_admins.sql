-- Migration: Fix RLS policies on email_stats_daily and nps_stats_daily
-- Issue: Agency admins can't view their team's data because RLS policies
--        only allow viewing own data, but agency admins need to query
--        multiple owner_ids at once.
-- Solution: Make RLS permissive for authenticated users (filtering is done
--           at application level via owner_id filters in queries)

-- ============================================================================
-- 1. FIX email_stats_daily RLS
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "email_stats_policy" ON email_stats_daily;
DROP POLICY IF EXISTS "Users can view their own email stats" ON email_stats_daily;
DROP POLICY IF EXISTS "Users can insert their own email stats" ON email_stats_daily;
DROP POLICY IF EXISTS "Users can update their own email stats" ON email_stats_daily;
DROP POLICY IF EXISTS "Service role full access" ON email_stats_daily;
DROP POLICY IF EXISTS "Authenticated can view email_stats_daily" ON email_stats_daily;
DROP POLICY IF EXISTS "Authenticated can insert email_stats_daily" ON email_stats_daily;
DROP POLICY IF EXISTS "Authenticated can update email_stats_daily" ON email_stats_daily;

-- Ensure RLS is enabled
ALTER TABLE email_stats_daily ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (filtering is done at application level)
CREATE POLICY "Authenticated can view email_stats_daily"
  ON email_stats_daily FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert email_stats_daily"
  ON email_stats_daily FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update email_stats_daily"
  ON email_stats_daily FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role has full access (for edge functions and cron jobs)
CREATE POLICY "Service role full access email_stats_daily"
  ON email_stats_daily FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. FIX nps_stats_daily RLS
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own NPS stats" ON nps_stats_daily;
DROP POLICY IF EXISTS "Users can insert their own NPS stats" ON nps_stats_daily;
DROP POLICY IF EXISTS "Users can update their own NPS stats" ON nps_stats_daily;
DROP POLICY IF EXISTS "Service role full access" ON nps_stats_daily;
DROP POLICY IF EXISTS "Authenticated can view nps_stats_daily" ON nps_stats_daily;
DROP POLICY IF EXISTS "Authenticated can insert nps_stats_daily" ON nps_stats_daily;
DROP POLICY IF EXISTS "Authenticated can update nps_stats_daily" ON nps_stats_daily;

-- Ensure RLS is enabled
ALTER TABLE nps_stats_daily ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (filtering is done at application level)
CREATE POLICY "Authenticated can view nps_stats_daily"
  ON nps_stats_daily FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert nps_stats_daily"
  ON nps_stats_daily FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update nps_stats_daily"
  ON nps_stats_daily FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role has full access (for edge functions and cron jobs)
CREATE POLICY "Service role full access nps_stats_daily"
  ON nps_stats_daily FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
