// src/hooks/useActivity.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activityLogService } from '../services/activityLog';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get recent activity
 */
export function useRecentActivity(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['activity', filterKey, options],
    queryFn: () => activityLogService.getRecent(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get activity for an account
 */
export function useAccountActivity(accountId, limit = 20) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['activity', filterKey, 'account', accountId],
    queryFn: () => activityLogService.getByAccount(ownerIds, accountId, limit),
    enabled: ownerIds.length > 0 && !!accountId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get activity for an automation
 */
export function useAutomationActivity(automationId, limit = 50) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['activity', filterKey, 'automation', automationId],
    queryFn: () => activityLogService.getByAutomation(ownerIds, automationId, limit),
    enabled: ownerIds.length > 0 && !!automationId
  });
}

/**
 * Get activity by event type
 */
export function useActivityByType(eventType, options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['activity', filterKey, 'type', eventType, options],
    queryFn: () => activityLogService.getByType(ownerIds, eventType, options),
    enabled: ownerIds.length > 0 && !!eventType
  });
}

/**
 * Get activity stats
 */
export function useActivityStats(days = 7) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['activity', filterKey, 'stats', days],
    queryFn: () => activityLogService.getStats(ownerIds, days),
    enabled: ownerIds.length > 0
  });
}

/**
 * Activity log mutations
 */
export function useActivityMutations() {
  const { ownerIds, filterKey } = useEffectiveOwner();
  const queryClient = useQueryClient();

  const logActivity = useMutation({
    mutationFn: (activity) => activityLogService.log(ownerIds, activity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    }
  });

  return { logActivity };
}

export default useRecentActivity;
