// src/hooks/useTimeline.js
import { useQuery } from '@tanstack/react-query';
import { timelineService } from '../services/timeline';

/**
 * Hook to fetch master automations with their templates for timeline visualization
 */
export function useTimelineAutomations() {
  return useQuery({
    queryKey: ['timeline', 'automations'],
    queryFn: () => timelineService.getMasterAutomationsWithTemplates(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to fetch filtered automations for timeline
 * @param {Object} filters - Filter options
 * @param {string} filters.category - Category filter (Onboarding, Retention, etc.)
 * @param {string} filters.lineOfBusiness - Personal/Commercial filter
 * @param {string} filters.search - Search term
 * @param {Object} filters.dateRange - Date range filter { start, end }
 */
export function useFilteredTimelineAutomations(filters = {}) {
  const hasFilters = filters.category || filters.lineOfBusiness || filters.search || filters.dateRange;

  return useQuery({
    queryKey: ['timeline', 'automations', 'filtered', filters],
    queryFn: () => timelineService.getFilteredAutomations(filters),
    staleTime: 5 * 60 * 1000,
    // Only refetch when filters change
    keepPreviousData: true,
  });
}

/**
 * Hook to fetch lifecycle stages with automations
 * Returns automations grouped by lifecycle stage in order
 */
export function useLifecycleStages() {
  return useQuery({
    queryKey: ['timeline', 'lifecycle-stages'],
    queryFn: () => timelineService.getLifecycleStages(),
    staleTime: 5 * 60 * 1000,
  });
}

export default {
  useTimelineAutomations,
  useFilteredTimelineAutomations,
  useLifecycleStages
};
