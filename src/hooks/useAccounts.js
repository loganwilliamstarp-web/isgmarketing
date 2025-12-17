// src/hooks/useAccounts.js
import { useQuery } from '@tanstack/react-query';
import { accountsService } from '../services/accounts';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all accounts
 */
export function useAccounts(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, options],
    queryFn: () => accountsService.getAll(ownerId, options),
    enabled: !!ownerId
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
    enabled: !!accountId
  });
}

/**
 * Get account with full email history
 */
export function useAccountWithEmailHistory(accountId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['account', accountId, 'emailHistory', ownerId],
    queryFn: () => accountsService.getByIdWithEmailHistory(ownerId, accountId),
    enabled: !!ownerId && !!accountId
  });
}

/**
 * Search accounts
 */
export function useAccountSearch(searchTerm, limit = 20) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'search', searchTerm],
    queryFn: () => accountsService.search(ownerId, searchTerm, limit),
    enabled: !!ownerId && !!searchTerm && searchTerm.length >= 2
  });
}

/**
 * Get customers
 */
export function useCustomers(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'customers', options],
    queryFn: () => accountsService.getCustomers(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get prospects
 */
export function useProspects(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'prospects', options],
    queryFn: () => accountsService.getProspects(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get prior customers
 */
export function usePriorCustomers(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'priorCustomers', options],
    queryFn: () => accountsService.getPriorCustomers(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get accounts with expiring policies
 */
export function useExpiringPolicies(daysOut = 45) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'expiring', daysOut],
    queryFn: () => accountsService.getWithExpiringPolicies(ownerId, daysOut),
    enabled: !!ownerId
  });
}

/**
 * Get account counts by status
 */
export function useAccountCounts() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'counts'],
    queryFn: () => accountsService.getCounts(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Get account stats summary (type counts + expiring policies)
 */
export function useAccountStats() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['accounts', ownerId, 'stats'],
    queryFn: () => accountsService.getStats(ownerId),
    enabled: !!ownerId
  });
}

export default useAccounts;
