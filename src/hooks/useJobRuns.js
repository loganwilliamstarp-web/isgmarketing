// src/hooks/useJobRuns.js
import { useQuery } from '@tanstack/react-query';
import { jobRunsService } from '../services/jobRuns';

/**
 * Recent background-job runs (master admin dashboard).
 */
export function useRecentJobRuns(limit = 50) {
  return useQuery({
    queryKey: ['job-runs', 'recent', limit],
    queryFn: () => jobRunsService.getRecent(limit),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  });
}

/**
 * Per-job 24h summary: latest run, run count, failure count.
 */
export function useJobStatusSummary() {
  return useQuery({
    queryKey: ['job-runs', 'summary'],
    queryFn: () => jobRunsService.getStatusSummary(),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  });
}
