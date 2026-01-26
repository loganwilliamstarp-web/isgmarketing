// src/hooks/useDashboard.js
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get all dashboard data
 */
export function useDashboard(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, options],
    queryFn: () => dashboardService.getDashboardData(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchInterval: 60000 // Auto-refresh every minute
  });
}

/**
 * Get quick stats (lightweight)
 */
export function useQuickStats() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, 'quick'],
    queryFn: () => dashboardService.getQuickStats(ownerIds),
    enabled: ownerIds.length > 0,
    staleTime: 5000,      // Consider stale after 5 seconds
    refetchInterval: 15000 // Auto-refresh every 15 seconds for more responsive updates
  });
}

/**
 * Get automation stats
 */
export function useAutomationStatsOverview() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, 'automationStats'],
    queryFn: () => dashboardService.getAutomationStats(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get email performance over time (for charts)
 */
export function useEmailPerformanceChart(days = 30) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, 'performance', days],
    queryFn: () => dashboardService.getEmailPerformanceOverTime(ownerIds, days),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get top performing automations
 */
export function useTopAutomations(limit = 5) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, 'topAutomations', limit],
    queryFn: () => dashboardService.getTopAutomations(ownerIds, limit),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get accounts needing attention
 */
export function useAccountsNeedingAttention() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, 'needsAttention'],
    queryFn: () => dashboardService.getAccountsNeedingAttention(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Live stats with auto-refresh
 */
export function useLiveStats(refreshInterval = 30000) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['dashboard', filterKey, 'live'],
    queryFn: () => dashboardService.getQuickStats(ownerIds),
    enabled: ownerIds.length > 0,
    refetchInterval: refreshInterval
  });
}

export default useDashboard;
