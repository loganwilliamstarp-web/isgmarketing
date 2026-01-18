// src/hooks/useNPS.js
// NPS-related React Query hooks

import { useQuery } from '@tanstack/react-query';
import { npsService } from '../services/nps';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get current NPS score and breakdown
 * @param {Object} options - { startDate, endDate }
 */
export function useCurrentNPS(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['nps', filterKey, 'current', options],
    queryFn: () => npsService.getCurrentNPS(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 60000 // 1 minute
  });
}

/**
 * Get NPS trend over time
 * @param {number} days - Number of days (default: 30)
 */
export function useNPSTrend(days = 30) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['nps', filterKey, 'trend', days],
    queryFn: () => npsService.getNPSTrend(ownerIds, days),
    enabled: ownerIds.length > 0,
    staleTime: 60000
  });
}

/**
 * Get NPS comparison between current and previous period
 * @param {number} days - Period length in days
 */
export function useNPSComparison(days = 30) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['nps', filterKey, 'comparison', days],
    queryFn: () => npsService.getNPSComparison(ownerIds, days),
    enabled: ownerIds.length > 0,
    staleTime: 60000
  });
}

/**
 * Get recent survey responses
 * @param {Object} options - { limit, category: 'promoter'|'passive'|'detractor' }
 */
export function useRecentSurveyResponses(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['nps', filterKey, 'responses', options],
    queryFn: () => npsService.getRecentResponses(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 30000
  });
}

/**
 * Get survey response rate
 * @param {number} days - Number of days to calculate (default: 30)
 */
export function useSurveyResponseRate(days = 30) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['nps', filterKey, 'responseRate', days],
    queryFn: () => npsService.getSurveyResponseRate(ownerIds, days),
    enabled: ownerIds.length > 0,
    staleTime: 60000
  });
}

export default {
  useCurrentNPS,
  useNPSTrend,
  useNPSComparison,
  useRecentSurveyResponses,
  useSurveyResponseRate
};
