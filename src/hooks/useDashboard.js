// src/hooks/useDashboard.js
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboard';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all dashboard data
 */
export function useDashboard(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, options],
    queryFn: () => dashboardService.getDashboardData(ownerId, options),
    enabled: !!ownerId,
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchInterval: 60000 // Auto-refresh every minute
  });
}

/**
 * Get quick stats (lightweight)
 */
export function useQuickStats() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, 'quick'],
    queryFn: () => dashboardService.getQuickStats(ownerId),
    enabled: !!ownerId,
    staleTime: 10000,
    refetchInterval: 30000
  });
}

/**
 * Get automation stats
 */
export function useAutomationStatsOverview() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, 'automationStats'],
    queryFn: () => dashboardService.getAutomationStats(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Get email performance over time (for charts)
 */
export function useEmailPerformanceChart(days = 30) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, 'performance', days],
    queryFn: () => dashboardService.getEmailPerformanceOverTime(ownerId, days),
    enabled: !!ownerId
  });
}

/**
 * Get top performing automations
 */
export function useTopAutomations(limit = 5) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, 'topAutomations', limit],
    queryFn: () => dashboardService.getTopAutomations(ownerId, limit),
    enabled: !!ownerId
  });
}

/**
 * Get accounts needing attention
 */
export function useAccountsNeedingAttention() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, 'needsAttention'],
    queryFn: () => dashboardService.getAccountsNeedingAttention(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Live stats with auto-refresh
 */
export function useLiveStats(refreshInterval = 30000) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['dashboard', ownerId, 'live'],
    queryFn: () => dashboardService.getQuickStats(ownerId),
    enabled: !!ownerId,
    refetchInterval: refreshInterval
  });
}

export default useDashboard;
