// src/services/jobRuns.js
// Read access to the job_runs table - one row per background-job invocation
// (process-scheduled-emails, sync-salesforce, validate-emails). Written by the
// edge functions via the service role; the dashboard only reads.

import { supabase } from '../lib/supabase';

// A run row with success=null is in progress; if it's older than this it
// never finished (the runtime killed the isolate mid-run).
const KILLED_THRESHOLD_MS = 10 * 60 * 1000;

export function runOutcome(run) {
  if (!run) return 'unknown';
  if (run.success === true) return 'ok';
  if (run.success === false) return 'failed';
  const age = Date.now() - new Date(run.started_at).getTime();
  return age > KILLED_THRESHOLD_MS ? 'killed' : 'running';
}

export const jobRunsService = {
  /**
   * Most recent runs across all jobs, newest first.
   * @param {number} limit
   */
  async getRecent(limit = 50) {
    const { data, error } = await supabase
      .from('job_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  /**
   * Per-job status summary: latest run + failure count over the last 24h.
   */
  async getStatusSummary() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('job_runs')
      .select('job_name, action, started_at, finished_at, duration_ms, success, summary, error_count, errors')
      .gte('started_at', dayAgo)
      .order('started_at', { ascending: false })
      .limit(1000);
    if (error) throw error;

    const byJob = {};
    for (const run of data || []) {
      if (!byJob[run.job_name]) {
        byJob[run.job_name] = { jobName: run.job_name, latest: run, runs: 0, failures: 0 };
      }
      byJob[run.job_name].runs += 1;
      const outcome = runOutcome(run);
      if (outcome === 'failed' || outcome === 'killed') byJob[run.job_name].failures += 1;
    }
    return Object.values(byJob).sort((a, b) => a.jobName.localeCompare(b.jobName));
  }
};
