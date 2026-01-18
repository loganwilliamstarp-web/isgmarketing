// src/hooks/useReports.js
// Reports-related React Query hooks

import { useQuery, useMutation } from '@tanstack/react-query';
import { reportsService } from '../services/reports';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get comprehensive report dashboard data
 * @param {Object} options - { days }
 */
export function useReportsDashboard(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['reports', filterKey, 'dashboard', options],
    queryFn: () => reportsService.getDashboardReport(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 30000
  });
}

/**
 * Get email performance time-series data
 * @param {Object} options - { days, aggregation: 'daily'|'weekly' }
 */
export function useEmailPerformanceReport(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['reports', filterKey, 'emailPerformance', options],
    queryFn: () => reportsService.getEmailPerformanceReport(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 30000
  });
}

/**
 * Export report as CSV
 * Returns a mutation that can be called with { reportType, options }
 */
export function useReportExport() {
  const { ownerIds } = useEffectiveOwner();

  return useMutation({
    mutationFn: async ({ reportType = 'all', options = {} }) => {
      const result = await reportsService.exportReportCSV(ownerIds, reportType, options);

      // Trigger download
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return result;
    }
  });
}

/**
 * Get cohort analysis data
 * @param {Object} options - { cohortSize: 'week'|'month' }
 */
export function useCohortAnalysis(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['reports', filterKey, 'cohorts', options],
    queryFn: () => reportsService.getCohortAnalysis(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 60000
  });
}

export default {
  useReportsDashboard,
  useEmailPerformanceReport,
  useReportExport,
  useCohortAnalysis
};
