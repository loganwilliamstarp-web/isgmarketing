// src/hooks/useActivity.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activityLogService } from '../services/activityLog';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get recent activity
 */
export function useRecentActivity(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['activity', ownerId, options],
    queryFn: () => activityLogService.getRecent(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get activity for an account
 */
export function useAccountActivity(accountId, limit = 20) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['activity', ownerId, 'account', accountId],
    queryFn: () => activityLogService.getByAccount(ownerId, accountId, limit),
    enabled: !!ownerId && !!accountId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get activity for an automation
 */
export function useAutomationActivity(automationId, limit = 50) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['activity', ownerId, 'automation', automationId],
    queryFn: () => activityLogService.getByAutomation(ownerId, automationId, limit),
    enabled: !!ownerId && !!automationId
  });
}

/**
 * Get activity by event type
 */
export function useActivityByType(eventType, options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['activity', ownerId, 'type', eventType, options],
    queryFn: () => activityLogService.getByType(ownerId, eventType, options),
    enabled: !!ownerId && !!eventType
  });
}

/**
 * Get activity stats
 */
export function useActivityStats(days = 7) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['activity', ownerId, 'stats', days],
    queryFn: () => activityLogService.getStats(ownerId, days),
    enabled: !!ownerId
  });
}

/**
 * Activity log mutations
 */
export function useActivityMutations() {
  const ownerId = useOwnerId();
  const queryClient = useQueryClient();

  const logActivity = useMutation({
    mutationFn: (activity) => activityLogService.log(ownerId, activity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', ownerId] });
    }
  });

  return { logActivity };
}

export default useRecentActivity;
