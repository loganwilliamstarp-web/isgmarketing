// supabase/functions/_shared/jobRuns.ts
//
// Record the outcome of a background job run into the job_runs table so cron
// invocations (whose HTTP responses pg_net discards) leave a visible trail.
// Best-effort: recording must never fail the job itself.

export interface JobRunRecord {
  jobName: string
  action?: string | null
  startedAtMs: number
  success: boolean
  summary?: Record<string, unknown>
  errors?: string[]
}

/**
 * Insert an in-progress run row (finished_at/success null) at the START of a
 * job, so a run killed by the runtime still leaves a visible trace.
 * Returns the row id for completeJobRun, or null if the insert failed.
 */
export async function beginJobRun(
  supabase: any,
  run: { jobName: string, action?: string | null, startedAtMs: number }
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('job_runs')
      .insert({
        job_name: run.jobName,
        action: run.action ?? null,
        started_at: new Date(run.startedAtMs).toISOString(),
        finished_at: null,
        success: null,
      })
      .select('id')
      .single()
    if (error) {
      console.error(`[jobRuns] Failed to begin ${run.jobName} run:`, error.message)
      return null
    }
    return data?.id ?? null
  } catch (err: any) {
    console.error(`[jobRuns] Failed to begin ${run.jobName} run:`, err?.message)
    return null
  }
}

/**
 * Finalize a run started with beginJobRun. Falls back to a plain insert when
 * the begin call failed (runId null).
 */
export async function completeJobRun(supabase: any, runId: number | null, run: JobRunRecord): Promise<void> {
  if (runId == null) return recordJobRun(supabase, run)
  try {
    const finished = Date.now()
    const { error } = await supabase
      .from('job_runs')
      .update({
        finished_at: new Date(finished).toISOString(),
        duration_ms: finished - run.startedAtMs,
        success: run.success,
        summary: run.summary ?? {},
        error_count: run.errors?.length ?? 0,
        errors: (run.errors ?? []).slice(0, 50),
      })
      .eq('id', runId)
    if (error) console.error(`[jobRuns] Failed to complete ${run.jobName} run:`, error.message)
  } catch (err: any) {
    console.error(`[jobRuns] Failed to complete ${run.jobName} run:`, err?.message)
  }
}

export async function recordJobRun(supabase: any, run: JobRunRecord): Promise<void> {
  try {
    const finished = Date.now()
    const { error } = await supabase.from('job_runs').insert({
      job_name: run.jobName,
      action: run.action ?? null,
      started_at: new Date(run.startedAtMs).toISOString(),
      finished_at: new Date(finished).toISOString(),
      duration_ms: finished - run.startedAtMs,
      success: run.success,
      summary: run.summary ?? {},
      error_count: run.errors?.length ?? 0,
      // Cap stored errors so a pathological run can't bloat the row.
      errors: (run.errors ?? []).slice(0, 50),
    })
    if (error) console.error(`[jobRuns] Failed to record ${run.jobName} run:`, error.message)
  } catch (err: any) {
    console.error(`[jobRuns] Failed to record ${run.jobName} run:`, err?.message)
  }
}
