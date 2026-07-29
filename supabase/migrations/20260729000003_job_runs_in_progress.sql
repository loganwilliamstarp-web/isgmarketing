-- Allow job_runs rows to represent in-progress (and killed) runs.
--
-- Edge functions now insert a row at run START (finished_at/success NULL) and
-- update it at completion. A run whose isolate the runtime kills mid-way
-- leaves the NULL row behind - "started, never finished" - instead of
-- vanishing without a trace. This is exactly what happened to the email
-- engine's every-5-minute 'daily' runs, which were being killed during the
-- refresh phase with nothing recorded anywhere.

ALTER TABLE job_runs
  ALTER COLUMN finished_at DROP NOT NULL,
  ALTER COLUMN finished_at DROP DEFAULT;

ALTER TABLE job_runs
  ALTER COLUMN success DROP NOT NULL,
  ALTER COLUMN success DROP DEFAULT;
