// src/hooks/useAccounts.js
import { useQuery } from '@tanstack/react-query';
import { accountsService } from '../services/accounts';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get all accounts
 */
export function useAccounts(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, options],
    queryFn: () => accountsService.getAll(ownerIds, options),
    enabled: ownerIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get account by ID
 */
export function useAccount(accountId) {
  return useQuery({
    queryKey: ['account', accountId],
    queryFn: () => accountsService.getById(accountId),
    enabled: !!accountId
  });
}

/**
 * Get account with policies
 */
export function useAccountWithPolicies(accountId) {
  return useQuery({
    queryKey: ['account', accountId, 'policies'],
    queryFn: () => accountsService.getByIdWithPolicies(accountId),
    enabled: !!accountId,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Get account with full email history
 */
export function useAccountWithEmailHistory(accountId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['account', accountId, 'emailHistory', filterKey],
    queryFn: () => accountsService.getByIdWithEmailHistory(ownerIds, accountId),
    enabled: ownerIds.length > 0 && !!accountId
  });
}

/**
 * Search accounts
 */
export function useAccountSearch(searchTerm, limit = 20) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'search', searchTerm],
    queryFn: () => accountsService.search(ownerIds, searchTerm, limit),
    enabled: ownerIds.length > 0 && !!searchTerm && searchTerm.length >= 2
  });
}

/**
 * Get customers
 */
export function useCustomers(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'customers', options],
    queryFn: () => accountsService.getCustomers(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get prospects
 */
export function useProspects(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'prospects', options],
    queryFn: () => accountsService.getProspects(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get prior customers
 */
export function usePriorCustomers(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'priorCustomers', options],
    queryFn: () => accountsService.getPriorCustomers(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get accounts with expiring policies
 */
export function useExpiringPolicies(daysOut = 45) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'expiring', daysOut],
    queryFn: () => accountsService.getWithExpiringPolicies(ownerIds, daysOut),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get account counts by status
 */
export function useAccountCounts() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'counts'],
    queryFn: () => accountsService.getCounts(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get account stats summary (type counts + expiring policies)
 */
export function useAccountStats() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['accounts', filterKey, 'stats'],
    queryFn: () => accountsService.getStats(ownerIds),
    enabled: ownerIds.length > 0
  });
}

export default useAccounts;
