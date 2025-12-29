// src/hooks/useMassEmails.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { massEmailsService } from '../services/massEmails';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all mass email batches
 */
export function useMassEmailBatches(options = {}) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmails', ownerId, options],
    queryFn: () => massEmailsService.getAll(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get all mass email batches with stats
 */
export function useMassEmailBatchesWithStats(options = {}) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmails', ownerId, 'withStats', options],
    queryFn: () => massEmailsService.getAllWithStats(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get a single mass email batch
 */
export function useMassEmailBatch(batchId) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmail', ownerId, batchId],
    queryFn: () => massEmailsService.getById(ownerId, batchId),
    enabled: !!ownerId && !!batchId
  });
}

/**
 * Get recipients for a filter config
 */
export function useMassEmailRecipients(filterConfig, options = {}) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmailRecipients', ownerId, filterConfig, options],
    queryFn: () => massEmailsService.getRecipients(ownerId, filterConfig, options),
    enabled: !!ownerId && !!filterConfig
  });
}

/**
 * Count recipients for a filter config
 */
export function useMassEmailRecipientCount(filterConfig) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmailRecipientCount', ownerId, filterConfig],
    queryFn: () => massEmailsService.countRecipients(ownerId, filterConfig),
    enabled: !!ownerId && !!filterConfig
  });
}

/**
 * Get location breakdown of recipients
 */
export function useMassEmailLocationBreakdown(filterConfig) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmailLocationBreakdown', ownerId, filterConfig],
    queryFn: () => massEmailsService.getRecipientLocationBreakdown(ownerId, filterConfig),
    enabled: !!ownerId && !!filterConfig
  });
}

/**
 * Get batch stats
 */
export function useMassEmailBatchStats(batchId) {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['massEmailStats', ownerId, batchId],
    queryFn: () => massEmailsService.getBatchStats(ownerId, batchId),
    enabled: !!ownerId && !!batchId
  });
}

/**
 * Mass email mutations
 */
export function useMassEmailMutations() {
  const ownerId = useOwnerId();
  const queryClient = useQueryClient();

  const invalidateMassEmails = () => {
    queryClient.invalidateQueries({ queryKey: ['massEmails', ownerId] });
  };

  const createBatch = useMutation({
    mutationFn: (batch) => massEmailsService.create(ownerId, batch),
    onSuccess: invalidateMassEmails
  });

  const updateBatch = useMutation({
    mutationFn: ({ batchId, updates }) => massEmailsService.update(ownerId, batchId, updates),
    onSuccess: invalidateMassEmails
  });

  const deleteBatch = useMutation({
    mutationFn: (batchId) => massEmailsService.delete(ownerId, batchId),
    onSuccess: invalidateMassEmails
  });

  const scheduleBatch = useMutation({
    mutationFn: ({ batchId, scheduledFor }) => massEmailsService.scheduleBatch(ownerId, batchId, scheduledFor),
    onSuccess: () => {
      invalidateMassEmails();
      queryClient.invalidateQueries({ queryKey: ['scheduledEmails', ownerId] });
    }
  });

  const cancelBatch = useMutation({
    mutationFn: (batchId) => massEmailsService.cancelBatch(ownerId, batchId),
    onSuccess: () => {
      invalidateMassEmails();
      queryClient.invalidateQueries({ queryKey: ['scheduledEmails', ownerId] });
    }
  });

  return {
    createBatch,
    updateBatch,
    deleteBatch,
    scheduleBatch,
    cancelBatch
  };
}

export default useMassEmailBatches;
