// src/hooks/useScheduledEmails.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduledEmailsService } from '../services/scheduledEmails';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get all scheduled emails
 */
export function useScheduledEmails(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['scheduledEmails', filterKey, options],
    queryFn: () => scheduledEmailsService.getAll(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get upcoming scheduled emails
 */
export function useUpcomingEmails(limit = 10) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['scheduledEmails', filterKey, 'upcoming', limit],
    queryFn: () => scheduledEmailsService.getUpcoming(ownerIds, limit),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get a single scheduled email
 */
export function useScheduledEmail(scheduledEmailId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['scheduledEmail', filterKey, scheduledEmailId],
    queryFn: () => scheduledEmailsService.getById(ownerIds, scheduledEmailId),
    enabled: ownerIds.length > 0 && !!scheduledEmailId
  });
}

/**
 * Get scheduled email stats
 */
export function useScheduledEmailStats() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['scheduledEmails', filterKey, 'stats'],
    queryFn: () => scheduledEmailsService.getStats(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Scheduled email mutations
 */
export function useScheduledEmailMutations() {
  const { ownerIds, filterKey } = useEffectiveOwner();
  const queryClient = useQueryClient();

  const invalidateScheduled = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduledEmails'] });
  };

  const scheduleEmail = useMutation({
    mutationFn: (scheduledEmail) => scheduledEmailsService.create(ownerIds, scheduledEmail),
    onSuccess: invalidateScheduled
  });

  const scheduleBatch = useMutation({
    mutationFn: (scheduledEmails) => scheduledEmailsService.createBatch(ownerIds, scheduledEmails),
    onSuccess: invalidateScheduled
  });

  const cancelScheduled = useMutation({
    mutationFn: (scheduledEmailId) => scheduledEmailsService.cancel(ownerIds, scheduledEmailId),
    onSuccess: invalidateScheduled
  });

  const reschedule = useMutation({
    mutationFn: ({ scheduledEmailId, newScheduledFor }) =>
      scheduledEmailsService.reschedule(ownerIds, scheduledEmailId, newScheduledFor),
    onSuccess: invalidateScheduled
  });

  const deleteScheduled = useMutation({
    mutationFn: (scheduledEmailId) => scheduledEmailsService.delete(ownerIds, scheduledEmailId),
    onSuccess: invalidateScheduled
  });

  const sendNow = useMutation({
    mutationFn: (scheduledEmailId) => scheduledEmailsService.sendNow(ownerIds, scheduledEmailId),
    onSuccess: () => {
      invalidateScheduled();
      // Also invalidate email logs and activity since we just sent an email
      queryClient.invalidateQueries({ queryKey: ['emailLogs'] });
      queryClient.invalidateQueries({ queryKey: ['emailActivity'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['quickStats'] });
    }
  });

  const sendDirectEmail = useMutation({
    mutationFn: (emailData) => scheduledEmailsService.sendDirectEmail(ownerIds, emailData),
    onSuccess: () => {
      invalidateScheduled();
      queryClient.invalidateQueries({ queryKey: ['emailLogs'] });
      queryClient.invalidateQueries({ queryKey: ['emailActivity'] });
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      queryClient.invalidateQueries({ queryKey: ['quickStats'] });
    }
  });

  return {
    scheduleEmail,
    scheduleBatch,
    cancelScheduled,
    reschedule,
    deleteScheduled,
    sendNow,
    sendDirectEmail
  };
}

export default useScheduledEmails;
