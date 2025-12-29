// src/hooks/useEmailLogs.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailLogsService, emailEventsService } from '../services/emailLogs';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all email logs
 */
export function useEmailLogs(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLogs', ownerId, options],
    queryFn: () => emailLogsService.getAll(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get a single email log by ID
 */
export function useEmailLog(emailLogId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLog', ownerId, emailLogId],
    queryFn: () => emailLogsService.getById(ownerId, emailLogId),
    enabled: !!ownerId && !!emailLogId
  });
}

/**
 * Get email log with all events
 */
export function useEmailLogWithEvents(emailLogId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLog', ownerId, emailLogId, 'events'],
    queryFn: () => emailLogsService.getByIdWithEvents(ownerId, emailLogId),
    enabled: !!ownerId && !!emailLogId
  });
}

/**
 * Get emails for an account
 */
export function useAccountEmailLogs(accountId, options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLogs', ownerId, 'account', accountId, options],
    queryFn: () => emailLogsService.getByAccount(ownerId, accountId, options),
    enabled: !!ownerId && !!accountId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get emails for an automation
 */
export function useAutomationEmailLogs(automationId, options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLogs', ownerId, 'automation', automationId, options],
    queryFn: () => emailLogsService.getByAutomation(ownerId, automationId, options),
    enabled: !!ownerId && !!automationId
  });
}

/**
 * Get recent opens
 */
export function useRecentOpens(limit = 10) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLogs', ownerId, 'recentOpens', limit],
    queryFn: () => emailLogsService.getRecentOpens(ownerId, limit),
    enabled: !!ownerId
  });
}

/**
 * Get recent clicks
 */
export function useRecentClicks(limit = 10) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLogs', ownerId, 'recentClicks', limit],
    queryFn: () => emailLogsService.getRecentClicks(ownerId, limit),
    enabled: !!ownerId
  });
}

/**
 * Get bounced emails
 */
export function useBounces(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailLogs', ownerId, 'bounces', options],
    queryFn: () => emailLogsService.getBounces(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get email stats for date range
 */
export function useEmailStats(startDate, endDate, automationId = null) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailStats', ownerId, startDate, endDate, automationId],
    queryFn: () => emailLogsService.getStats(ownerId, startDate, endDate, automationId),
    enabled: !!ownerId && !!startDate && !!endDate
  });
}

/**
 * Get daily stats for charts
 */
export function useDailyStats(startDate, endDate, automationId = null) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailStats', ownerId, 'daily', startDate, endDate, automationId],
    queryFn: () => emailLogsService.getDailyStats(ownerId, startDate, endDate, automationId),
    enabled: !!ownerId && !!startDate && !!endDate
  });
}

/**
 * Get comparison stats (current vs previous period)
 */
export function useComparisonStats(days = 30) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['emailStats', ownerId, 'comparison', days],
    queryFn: () => emailLogsService.getComparisonStats(ownerId, days),
    enabled: !!ownerId
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
 * Email log mutations
 */
export function useEmailLogMutations() {
  const ownerId = useOwnerId();
  const queryClient = useQueryClient();

  const invalidateEmailLogs = () => {
    queryClient.invalidateQueries({ queryKey: ['emailLogs', ownerId] });
    queryClient.invalidateQueries({ queryKey: ['emailStats', ownerId] });
  };

  const createEmailLog = useMutation({
    mutationFn: (emailLog) => emailLogsService.create(ownerId, emailLog),
    onSuccess: invalidateEmailLogs
  });

  const markSent = useMutation({
    mutationFn: ({ emailLogId, sendgridMessageId }) => 
      emailLogsService.markSent(ownerId, emailLogId, sendgridMessageId),
    onSuccess: (data) => {
      invalidateEmailLogs();
      queryClient.setQueryData(['emailLog', ownerId, data.id], data);
    }
  });

  const markFailed = useMutation({
    mutationFn: ({ emailLogId, errorMessage, errorCode }) => 
      emailLogsService.markFailed(ownerId, emailLogId, errorMessage, errorCode),
    onSuccess: (data) => {
      invalidateEmailLogs();
      queryClient.setQueryData(['emailLog', ownerId, data.id], data);
    }
  });

  return {
    createEmailLog,
    markSent,
    markFailed
  };
}

export default useEmailLogs;
