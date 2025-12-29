// src/hooks/useScheduledEmails.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduledEmailsService } from '../services/scheduledEmails';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all scheduled emails
 */
export function useScheduledEmails(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['scheduledEmails', ownerId, options],
    queryFn: () => scheduledEmailsService.getAll(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get upcoming scheduled emails
 */
export function useUpcomingEmails(limit = 10) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['scheduledEmails', ownerId, 'upcoming', limit],
    queryFn: () => scheduledEmailsService.getUpcoming(ownerId, limit),
    enabled: !!ownerId
  });
}

/**
 * Get a single scheduled email
 */
export function useScheduledEmail(scheduledEmailId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['scheduledEmail', ownerId, scheduledEmailId],
    queryFn: () => scheduledEmailsService.getById(ownerId, scheduledEmailId),
    enabled: !!ownerId && !!scheduledEmailId
  });
}

/**
 * Get scheduled email stats
 */
export function useScheduledEmailStats() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['scheduledEmails', ownerId, 'stats'],
    queryFn: () => scheduledEmailsService.getStats(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Scheduled email mutations
 */
export function useScheduledEmailMutations() {
  const ownerId = useOwnerId();
  const queryClient = useQueryClient();

  const invalidateScheduled = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduledEmails', ownerId] });
  };

  const scheduleEmail = useMutation({
    mutationFn: (scheduledEmail) => scheduledEmailsService.create(ownerId, scheduledEmail),
    onSuccess: invalidateScheduled
  });

  const scheduleBatch = useMutation({
    mutationFn: (scheduledEmails) => scheduledEmailsService.createBatch(ownerId, scheduledEmails),
    onSuccess: invalidateScheduled
  });

  const cancelScheduled = useMutation({
    mutationFn: (scheduledEmailId) => scheduledEmailsService.cancel(ownerId, scheduledEmailId),
    onSuccess: invalidateScheduled
  });

  const reschedule = useMutation({
    mutationFn: ({ scheduledEmailId, newScheduledFor }) => 
      scheduledEmailsService.reschedule(ownerId, scheduledEmailId, newScheduledFor),
    onSuccess: invalidateScheduled
  });

  const deleteScheduled = useMutation({
    mutationFn: (scheduledEmailId) => scheduledEmailsService.delete(ownerId, scheduledEmailId),
    onSuccess: invalidateScheduled
  });

  return {
    scheduleEmail,
    scheduleBatch,
    cancelScheduled,
    reschedule,
    deleteScheduled
  };
}

export default useScheduledEmails;
