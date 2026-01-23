// src/hooks/useMasterAdminAnalytics.js
// React Query hooks for master admin analytics

import { useQuery } from '@tanstack/react-query';
import { masterAdminAnalyticsService } from '../services/masterAdminAnalytics';

/**
 * Get platform overview stats
 */
export function usePlatformOverview() {
  return useQuery({
    queryKey: ['masterAdmin', 'platformOverview'],
    queryFn: () => masterAdminAnalyticsService.getPlatformOverview(),
    staleTime: 60000, // 1 minute
    refetchInterval: 60000 // Refresh every minute
  });
}

/**
 * Get top agencies by email volume
 */
export function useTopAgencies(limit = 10) {
  return useQuery({
    queryKey: ['masterAdmin', 'topAgencies', limit],
    queryFn: () => masterAdminAnalyticsService.getTopAgencies(limit),
    staleTime: 60000
  });
}

/**
 * Get top automations by performance
 */
export function useTopAutomations(limit = 10) {
  return useQuery({
    queryKey: ['masterAdmin', 'topAutomations', limit],
    queryFn: () => masterAdminAnalyticsService.getTopAutomations(limit),
    staleTime: 60000
  });
}

/**
 * Get top users by email volume
 */
export function useTopUsers(limit = 10) {
  return useQuery({
    queryKey: ['masterAdmin', 'topUsers', limit],
    queryFn: () => masterAdminAnalyticsService.getTopUsers(limit),
    staleTime: 60000
  });
}

/**
 * Get recent bounces
 */
export function useRecentBounces(limit = 10) {
  return useQuery({
    queryKey: ['masterAdmin', 'recentBounces', limit],
    queryFn: () => masterAdminAnalyticsService.getRecentBounces(limit),
    staleTime: 30000
  });
}

/**
 * Get accounts with recent replies
 */
export function useAccountsWithReplies(limit = 10) {
  return useQuery({
    queryKey: ['masterAdmin', 'accountsWithReplies', limit],
    queryFn: () => masterAdminAnalyticsService.getAccountsWithReplies(limit),
    staleTime: 30000
  });
}

/**
 * Get email volume time series
 */
export function useEmailTimeSeries(days = 30) {
  return useQuery({
    queryKey: ['masterAdmin', 'emailTimeSeries', days],
    queryFn: () => masterAdminAnalyticsService.getEmailTimeSeries(days),
    staleTime: 60000
  });
}

/**
 * Get agency breakdown
 */
export function useAgencyBreakdown() {
  return useQuery({
    queryKey: ['masterAdmin', 'agencyBreakdown'],
    queryFn: () => masterAdminAnalyticsService.getAgencyBreakdown(),
    staleTime: 120000
  });
}

/**
 * Get system health metrics
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: ['masterAdmin', 'systemHealth'],
    queryFn: () => masterAdminAnalyticsService.getSystemHealth(),
    staleTime: 30000,
    refetchInterval: 30000 // Refresh every 30 seconds
  });
}

/**
 * Get recent activity feed
 */
export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ['masterAdmin', 'recentActivity', limit],
    queryFn: () => masterAdminAnalyticsService.getRecentActivity(limit),
    staleTime: 15000,
    refetchInterval: 15000 // Refresh every 15 seconds
  });
}

export default {
  usePlatformOverview,
  useTopAgencies,
  useTopAutomations,
  useTopUsers,
  useRecentBounces,
  useAccountsWithReplies,
  useEmailTimeSeries,
  useAgencyBreakdown,
  useSystemHealth,
  useRecentActivity
};
