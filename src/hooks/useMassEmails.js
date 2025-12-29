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
 * Get recipient stats (count and breakdown) in a single query
 * This avoids duplicate geocoding when both are needed
 */
export function useMassEmailRecipientStats(filterConfig) {
  const ownerId = useOwnerId();

  // Create a stable filter key that only includes filter-relevant data
  // This prevents unnecessary refetches when locationData object changes
  const stableFilterConfig = filterConfig ? {
    rules: filterConfig.rules?.map(r => ({
      field: r.field,
      operator: r.operator,
      value: r.value,
      value2: r.value2,
      radius: r.radius
    })),
    search: filterConfig.search,
    notOptedOut: filterConfig.notOptedOut
  } : null;

  return useQuery({
    queryKey: ['massEmailRecipientStats', ownerId, stableFilterConfig],
    queryFn: () => massEmailsService.getRecipientStats(ownerId, filterConfig),
    enabled: !!ownerId && !!filterConfig,
    staleTime: 30000, // Keep data fresh for 30 seconds
    gcTime: 60000, // Cache for 1 minute
    placeholderData: (previousData) => previousData // Show previous data while loading
  });
}

/**
 * Count recipients for a filter config
 * Uses the combined stats query internally
 */
export function useMassEmailRecipientCount(filterConfig) {
  const { data, isLoading, isFetching, error } = useMassEmailRecipientStats(filterConfig);
  return {
    data: data?.count,
    isLoading,
    isFetching,
    error
  };
}

/**
 * Get location breakdown of recipients
 * Uses the combined stats query internally
 */
export function useMassEmailLocationBreakdown(filterConfig) {
  const { data, isLoading, isFetching, error } = useMassEmailRecipientStats(filterConfig);
  return {
    data: data?.breakdown,
    isLoading,
    isFetching,
    error
  };
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
