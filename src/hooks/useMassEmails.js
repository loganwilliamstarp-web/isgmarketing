// src/hooks/useMassEmails.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { massEmailsService } from '../services/massEmails';
import { userSettingsService } from '../services/userSettings';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get all user IDs with the same role as the current user
 */
export function useRoleUserIds(includeRoleAccounts = false) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['roleUserIds', filterKey, includeRoleAccounts],
    queryFn: async () => {
      if (!includeRoleAccounts) {
        return ownerIds;
      }
      // When scope filter is active, ownerIds already contains all relevant users
      if (ownerIds.length > 1) {
        return ownerIds;
      }
      return userSettingsService.getUserIdsByRole(ownerIds[0]);
    },
    enabled: ownerIds.length > 0,
    staleTime: 60000 // Cache for 1 minute
  });
}

/**
 * Get all mass email batches
 */
export function useMassEmailBatches(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['massEmails', filterKey, options],
    queryFn: () => massEmailsService.getAll(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get all mass email batches with stats
 */
export function useMassEmailBatchesWithStats(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['massEmails', filterKey, 'withStats', options],
    queryFn: () => massEmailsService.getAllWithStats(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get a single mass email batch
 */
export function useMassEmailBatch(batchId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['massEmail', filterKey, batchId],
    queryFn: () => massEmailsService.getById(ownerIds, batchId),
    enabled: ownerIds.length > 0 && !!batchId
  });
}

/**
 * Get recipients for a filter config
 */
export function useMassEmailRecipients(filterConfig, options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['massEmailRecipients', filterKey, filterConfig, options],
    queryFn: () => massEmailsService.getRecipients(ownerIds, filterConfig, options),
    enabled: ownerIds.length > 0 && !!filterConfig
  });
}

/**
 * Get recipient stats (count and breakdown) in a single query
 * This avoids duplicate geocoding when both are needed
 * @param {Object} filterConfig - Filter configuration
 * @param {boolean} includeRoleAccounts - Include accounts from users with the same role
 */
export function useMassEmailRecipientStats(filterConfig, includeRoleAccounts = false) {
  const { ownerIds: effectiveOwnerIds, filterKey } = useEffectiveOwner();
  const { data: roleOwnerIds } = useRoleUserIds(includeRoleAccounts);

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
    groups: filterConfig.groups?.map(g => ({
      rules: g.rules?.map(r => ({
        field: r.field,
        operator: r.operator,
        value: r.value,
        value2: r.value2,
        radius: r.radius
      }))
    })),
    search: filterConfig.search,
    notOptedOut: filterConfig.notOptedOut,
    includeRoleAccounts
  } : null;

  return useQuery({
    queryKey: ['massEmailRecipientStats', filterKey, stableFilterConfig, roleOwnerIds],
    queryFn: () => massEmailsService.getRecipientStats(roleOwnerIds || effectiveOwnerIds, filterConfig),
    enabled: effectiveOwnerIds.length > 0 && !!filterConfig && !!roleOwnerIds,
    staleTime: 30000, // Keep data fresh for 30 seconds
    gcTime: 60000, // Cache for 1 minute
    placeholderData: (previousData) => previousData // Show previous data while loading
  });
}

/**
 * Count recipients for a filter config
 * Uses the combined stats query internally
 * @param {Object} filterConfig - Filter configuration
 * @param {boolean} includeRoleAccounts - Include accounts from users with the same role
 */
export function useMassEmailRecipientCount(filterConfig, includeRoleAccounts = false) {
  const { data, isLoading, isFetching, error } = useMassEmailRecipientStats(filterConfig, includeRoleAccounts);
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
 * @param {Object} filterConfig - Filter configuration
 * @param {boolean} includeRoleAccounts - Include accounts from users with the same role
 */
export function useMassEmailLocationBreakdown(filterConfig, includeRoleAccounts = false) {
  const { data, isLoading, isFetching, error } = useMassEmailRecipientStats(filterConfig, includeRoleAccounts);
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
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['massEmailStats', filterKey, batchId],
    queryFn: () => massEmailsService.getBatchStats(ownerIds, batchId),
    enabled: ownerIds.length > 0 && !!batchId
  });
}

/**
 * Mass email mutations
 */
export function useMassEmailMutations() {
  const { ownerIds, filterKey } = useEffectiveOwner();
  const queryClient = useQueryClient();

  const invalidateMassEmails = () => {
    queryClient.invalidateQueries({ queryKey: ['massEmails'] });
  };

  const createBatch = useMutation({
    mutationFn: (batch) => massEmailsService.create(ownerIds, batch),
    onSuccess: invalidateMassEmails
  });

  const updateBatch = useMutation({
    mutationFn: ({ batchId, updates }) => massEmailsService.update(ownerIds, batchId, updates),
    onSuccess: invalidateMassEmails
  });

  const deleteBatch = useMutation({
    mutationFn: (batchId) => massEmailsService.delete(ownerIds, batchId),
    onSuccess: invalidateMassEmails
  });

  const scheduleBatch = useMutation({
    mutationFn: ({ batchId, scheduledFor }) => massEmailsService.scheduleBatch(ownerIds, batchId, scheduledFor),
    onSuccess: () => {
      invalidateMassEmails();
      queryClient.invalidateQueries({ queryKey: ['scheduledEmails'] });
    }
  });

  const cancelBatch = useMutation({
    mutationFn: (batchId) => massEmailsService.cancelBatch(ownerIds, batchId),
    onSuccess: () => {
      invalidateMassEmails();
      queryClient.invalidateQueries({ queryKey: ['scheduledEmails'] });
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
