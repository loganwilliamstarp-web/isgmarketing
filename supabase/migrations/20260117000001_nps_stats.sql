-- ============================================================================
-- NPS STATS - Daily Aggregation Table and RPC Functions
-- ============================================================================
-- This migration adds support for Net Promoter Score (NPS) tracking and
-- historical trend analysis.
--
-- NPS Calculation from 1-5 star ratings:
--   Promoters: 4-5 stars (maps to NPS 9-10)
--   Passives: 3 stars (maps to NPS 7-8)
--   Detractors: 1-2 stars (maps to NPS 0-6)
--   NPS Score = % Promoters - % Detractors (range: -100 to +100)
-- ============================================================================

-- ============================================================================
-- 1. NPS STATS DAILY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS nps_stats_daily (
  id SERIAL PRIMARY KEY,

  -- Owner for multi-tenant isolation
  owner_id TEXT NOT NULL,
  stat_date DATE NOT NULL,

  -- NPS Components
  total_responses INTEGER DEFAULT 0,
  promoters INTEGER DEFAULT 0,       -- 4-5 stars
  passives INTEGER DEFAULT 0,        -- 3 stars
  detractors INTEGER DEFAULT 0,      -- 1-2 stars

  -- Calculated NPS Score (-100 to +100)
  nps_score DECIMAL(5, 2),

  -- Additional metrics
  avg_rating DECIMAL(3, 2),          -- Average star rating (1.00 to 5.00)
  feedback_count INTEGER DEFAULT 0,  -- Number with written feedback

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_nps_stats_owner_date ON nps_stats_daily(owner_id, stat_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nps_stats_unique ON nps_stats_daily(owner_id, stat_date);

-- Comments
COMMENT ON TABLE nps_stats_daily IS 'Daily aggregated NPS (Net Promoter Score) statistics per owner';
COMMENT ON COLUMN nps_stats_daily.promoters IS 'Count of 4-5 star ratings (promoters)';
COMMENT ON COLUMN nps_stats_daily.passives IS 'Count of 3 star ratings (passives)';
COMMENT ON COLUMN nps_stats_daily.detractors IS 'Count of 1-2 star ratings (detractors)';
COMMENT ON COLUMN nps_stats_daily.nps_score IS 'NPS = % Promoters - % Detractors (range -100 to +100)';

-- Enable RLS
ALTER TABLE nps_stats_daily ENABLE ROW LEVEL SECURITY;

-- RLS Policies (match existing patterns)
CREATE POLICY "Users can view their own NPS stats"
  ON nps_stats_daily FOR SELECT
  USING (owner_id = auth.uid()::text);

CREATE POLICY "Users can insert their own NPS stats"
  ON nps_stats_daily FOR INSERT
  WITH CHECK (owner_id = auth.uid()::text);

CREATE POLICY "Users can update their own NPS stats"
  ON nps_stats_daily FOR UPDATE
  USING (owner_id = auth.uid()::text);

-- Service role has full access (for edge functions and cron jobs)
CREATE POLICY "Service role full access"
  ON nps_stats_daily FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 2. RPC FUNCTION: Calculate NPS Stats
-- ============================================================================
-- Calculates NPS metrics from the accounts table for a given owner and date range

CREATE OR REPLACE FUNCTION calculate_nps_stats(
  p_owner_ids TEXT[],
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  total_responses BIGINT,
  promoters BIGINT,
  passives BIGINT,
  detractors BIGINT,
  nps_score DECIMAL,
  avg_rating DECIMAL,
  feedback_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_responses,
    COUNT(*) FILTER (WHERE a.survey_stars::INTEGER >= 4)::BIGINT AS promoters,
    COUNT(*) FILTER (WHERE a.survey_stars::INTEGER = 3)::BIGINT AS passives,
    COUNT(*) FILTER (WHERE a.survey_stars::INTEGER <= 2)::BIGINT AS detractors,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(
          ((COUNT(*) FILTER (WHERE a.survey_stars::INTEGER >= 4)::DECIMAL / COUNT(*)) * 100) -
          ((COUNT(*) FILTER (WHERE a.survey_stars::INTEGER <= 2)::DECIMAL / COUNT(*)) * 100),
          2
        )
      ELSE 0::DECIMAL
    END AS nps_score,
    ROUND(AVG(a.survey_stars::INTEGER), 2) AS avg_rating,
    COUNT(*) FILTER (WHERE a.survey_feedback_text IS NOT NULL AND a.survey_feedback_text != '')::BIGINT AS feedback_count
  FROM accounts a
  WHERE a.owner_id = ANY(p_owner_ids)
    AND a.survey_stars IS NOT NULL
    AND a.survey_completed_at IS NOT NULL
    AND (p_start_date IS NULL OR a.survey_completed_at::DATE >= p_start_date)
    AND (p_end_date IS NULL OR a.survey_completed_at::DATE <= p_end_date);
END;
$$;

COMMENT ON FUNCTION calculate_nps_stats IS 'Calculate NPS statistics from accounts table for given owners and date range';

-- ============================================================================
-- 3. RPC FUNCTION: Get NPS Trend
-- ============================================================================
-- Returns daily NPS stats for trending/charting

CREATE OR REPLACE FUNCTION get_nps_trend(
  p_owner_ids TEXT[],
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  stat_date DATE,
  total_responses INTEGER,
  promoters INTEGER,
  passives INTEGER,
  detractors INTEGER,
  nps_score DECIMAL,
  avg_rating DECIMAL,
  feedback_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.stat_date,
    n.total_responses,
    n.promoters,
    n.passives,
    n.detractors,
    n.nps_score,
    n.avg_rating,
    n.feedback_count
  FROM nps_stats_daily n
  WHERE n.owner_id = ANY(p_owner_ids)
    AND n.stat_date >= CURRENT_DATE - p_days::INTEGER
  ORDER BY n.stat_date ASC;
END;
$$;

COMMENT ON FUNCTION get_nps_trend IS 'Get daily NPS trend data for charting';

-- ============================================================================
-- 4. RPC FUNCTION: Aggregate Daily NPS
-- ============================================================================
-- Aggregates NPS stats for a specific date (for cron job)

CREATE OR REPLACE FUNCTION aggregate_daily_nps(p_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  owner_rec RECORD;
  rows_affected INTEGER := 0;
BEGIN
  FOR owner_rec IN
    SELECT DISTINCT a.owner_id
    FROM accounts a
    WHERE a.survey_completed_at::DATE = p_date
      AND a.survey_stars IS NOT NULL
  LOOP
    INSERT INTO nps_stats_daily (
      owner_id,
      stat_date,
      total_responses,
      promoters,
      passives,
      detractors,
      nps_score,
      avg_rating,
      feedback_count
    )
    SELECT
      owner_rec.owner_id,
      p_date,
      COUNT(*),
      COUNT(*) FILTER (WHERE a.survey_stars::INTEGER >= 4),
      COUNT(*) FILTER (WHERE a.survey_stars::INTEGER = 3),
      COUNT(*) FILTER (WHERE a.survey_stars::INTEGER <= 2),
      CASE
        WHEN COUNT(*) > 0 THEN
          ROUND(
            ((COUNT(*) FILTER (WHERE a.survey_stars::INTEGER >= 4)::DECIMAL / COUNT(*)) * 100) -
            ((COUNT(*) FILTER (WHERE a.survey_stars::INTEGER <= 2)::DECIMAL / COUNT(*)) * 100),
            2
          )
        ELSE 0
      END,
      ROUND(AVG(a.survey_stars::INTEGER), 2),
      COUNT(*) FILTER (WHERE a.survey_feedback_text IS NOT NULL AND a.survey_feedback_text != '')
    FROM accounts a
    WHERE a.owner_id = owner_rec.owner_id
      AND a.survey_completed_at::DATE = p_date
    ON CONFLICT (owner_id, stat_date)
    DO UPDATE SET
      total_responses = EXCLUDED.total_responses,
      promoters = EXCLUDED.promoters,
      passives = EXCLUDED.passives,
      detractors = EXCLUDED.detractors,
      nps_score = EXCLUDED.nps_score,
      avg_rating = EXCLUDED.avg_rating,
      feedback_count = EXCLUDED.feedback_count,
      updated_at = NOW();

    rows_affected := rows_affected + 1;
  END LOOP;

  RETURN rows_affected;
END;
$$;

COMMENT ON FUNCTION aggregate_daily_nps IS 'Aggregate NPS stats for a specific date. Called by cron job.';

-- ============================================================================
-- 5. BACKFILL HISTORICAL DATA
-- ============================================================================
-- Populate nps_stats_daily with historical data from existing survey responses
-- Note: Run this separately if the automatic backfill fails due to type mismatches

DO $$
DECLARE
  d DATE;
  min_date DATE;
  max_date DATE;
  has_data BOOLEAN;
BEGIN
  -- Check if there's any survey data to backfill
  SELECT EXISTS(
    SELECT 1 FROM accounts
    WHERE survey_completed_at IS NOT NULL
    LIMIT 1
  ) INTO has_data;

  IF NOT has_data THEN
    RAISE NOTICE 'No survey data to backfill';
    RETURN;
  END IF;

  -- Find the date range of existing survey data
  SELECT
    MIN(survey_completed_at::DATE),
    MAX(survey_completed_at::DATE)
  INTO min_date, max_date
  FROM accounts
  WHERE survey_completed_at IS NOT NULL;

  -- Exit if no data
  IF min_date IS NULL THEN
    RAISE NOTICE 'No survey data to backfill';
    RETURN;
  END IF;

  -- Loop through each date and aggregate
  d := min_date;
  WHILE d <= max_date LOOP
    PERFORM aggregate_daily_nps(d);
    d := d + INTERVAL '1 day';
  END LOOP;

  RAISE NOTICE 'Backfilled NPS stats from % to %', min_date, max_date;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill skipped due to error: %. Run aggregate_daily_nps() manually if needed.', SQLERRM;
END;
$$;

-- ============================================================================
-- 6. CRON JOB SETUP (requires pg_cron extension)
-- ============================================================================
-- Uncomment if pg_cron is available

-- SELECT cron.schedule(
--   'aggregate-daily-nps',
--   '5 0 * * *',  -- Run at 00:05 UTC daily
--   $$SELECT aggregate_daily_nps()$$
-- );
