// src/hooks/useEmailLogs.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailLogsService, emailEventsService, emailActivityService } from '../services/emailLogs';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get all email logs
 */
export function useEmailLogs(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLogs', filterKey, options],
    queryFn: () => emailLogsService.getAll(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get a single email log by ID
 */
export function useEmailLog(emailLogId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLog', filterKey, emailLogId],
    queryFn: () => emailLogsService.getById(ownerIds, emailLogId),
    enabled: ownerIds.length > 0 && !!emailLogId
  });
}

/**
 * Get email log with all events
 */
export function useEmailLogWithEvents(emailLogId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLog', filterKey, emailLogId, 'events'],
    queryFn: () => emailLogsService.getByIdWithEvents(ownerIds, emailLogId),
    enabled: ownerIds.length > 0 && !!emailLogId
  });
}

/**
 * Get emails for an account
 */
export function useAccountEmailLogs(accountId, options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLogs', filterKey, 'account', accountId, options],
    queryFn: () => emailLogsService.getByAccount(ownerIds, accountId, options),
    enabled: ownerIds.length > 0 && !!accountId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get emails for an automation
 */
export function useAutomationEmailLogs(automationId, options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLogs', filterKey, 'automation', automationId, options],
    queryFn: () => emailLogsService.getByAutomation(ownerIds, automationId, options),
    enabled: ownerIds.length > 0 && !!automationId
  });
}

/**
 * Get recent opens
 */
export function useRecentOpens(limit = 10) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLogs', filterKey, 'recentOpens', limit],
    queryFn: () => emailLogsService.getRecentOpens(ownerIds, limit),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get recent clicks
 */
export function useRecentClicks(limit = 10) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLogs', filterKey, 'recentClicks', limit],
    queryFn: () => emailLogsService.getRecentClicks(ownerIds, limit),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get bounced emails
 */
export function useBounces(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailLogs', filterKey, 'bounces', options],
    queryFn: () => emailLogsService.getBounces(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get email stats for date range
 */
export function useEmailStats(startDate, endDate, automationId = null) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailStats', filterKey, startDate, endDate, automationId],
    queryFn: () => emailLogsService.getStats(ownerIds, startDate, endDate, automationId),
    enabled: ownerIds.length > 0 && !!startDate && !!endDate
  });
}

/**
 * Get daily stats for charts
 */
export function useDailyStats(startDate, endDate, automationId = null) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailStats', filterKey, 'daily', startDate, endDate, automationId],
    queryFn: () => emailLogsService.getDailyStats(ownerIds, startDate, endDate, automationId),
    enabled: ownerIds.length > 0 && !!startDate && !!endDate
  });
}

/**
 * Get comparison stats (current vs previous period)
 */
export function useComparisonStats(days = 30) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailStats', filterKey, 'comparison', days],
    queryFn: () => emailLogsService.getComparisonStats(ownerIds, days),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get events for an email log
 */
export function useEmailEvents(emailLogId) {
  return useQuery({
    queryKey: ['emailEvents', emailLogId],
    queryFn: () => emailEventsService.getByEmailLog(emailLogId),
    enabled: !!emailLogId
  });
}

/**
 * Get combined email activity feed (sends, opens, clicks, replies)
 */
export function useEmailActivityFeed(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailActivity', filterKey, options],
    queryFn: () => emailActivityService.getRecentActivity(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get combined email activity feed for a specific account
 */
export function useAccountEmailActivity(accountId, options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['emailActivity', filterKey, 'account', accountId, options],
    queryFn: () => emailActivityService.getAccountActivity(ownerIds, accountId, options),
    enabled: ownerIds.length > 0 && !!accountId,
    staleTime: 30000
  });
}

/**
 * Email log mutations
 */
export function useEmailLogMutations() {
  const { ownerIds, filterKey } = useEffectiveOwner();
  const queryClient = useQueryClient();

  const invalidateEmailLogs = () => {
    queryClient.invalidateQueries({ queryKey: ['emailLogs'] });
    queryClient.invalidateQueries({ queryKey: ['emailStats'] });
  };

  const createEmailLog = useMutation({
    mutationFn: (emailLog) => emailLogsService.create(ownerIds, emailLog),
    onSuccess: invalidateEmailLogs
  });

  const markSent = useMutation({
    mutationFn: ({ emailLogId, sendgridMessageId }) =>
      emailLogsService.markSent(ownerIds, emailLogId, sendgridMessageId),
    onSuccess: (data) => {
      invalidateEmailLogs();
      queryClient.setQueryData(['emailLog', filterKey, data.id], data);
    }
  });

  const markFailed = useMutation({
    mutationFn: ({ emailLogId, errorMessage, errorCode }) =>
      emailLogsService.markFailed(ownerIds, emailLogId, errorMessage, errorCode),
    onSuccess: (data) => {
      invalidateEmailLogs();
      queryClient.setQueryData(['emailLog', filterKey, data.id], data);
    }
  });

  return {
    createEmailLog,
    markSent,
    markFailed
  };
}

export default useEmailLogs;
