// src/hooks/useSenderDomains.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { senderDomainsService } from '../services';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Hook to get all sender domains for the effective user (respects impersonation)
 */
export function useSenderDomains() {
  const { ownerId, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['sender-domains', filterKey],
    queryFn: () => senderDomainsService.getAll(ownerId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!ownerId
  });
}

/**
 * Hook to get only verified sender domains for the effective user (respects impersonation)
 * Use this to check if user can send emails
 */
export function useVerifiedSenderDomains() {
  const { ownerId, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['sender-domains', 'verified', filterKey],
    queryFn: () => senderDomainsService.getVerifiedDomains(ownerId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!ownerId
  });
}

/**
 * Hook to check if effective user has at least one verified domain (respects impersonation)
 */
export function useHasVerifiedDomain() {
  const { data: domains, isLoading } = useVerifiedSenderDomains();
  return {
    hasVerifiedDomain: (domains?.length || 0) > 0,
    isLoading,
    domains
  };
}

/**
 * Hook for sender domain mutations
 */
export function useSenderDomainMutations() {
  const queryClient = useQueryClient();

  const addDomain = useMutation({
    mutationFn: ({ domain, subdomain }) => senderDomainsService.addDomain(domain, { subdomain }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-domains'] });
    }
  });

  const verifyDomain = useMutation({
    mutationFn: (domainId) => senderDomainsService.verifyDomain(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-domains'] });
    }
  });

  const updateDefaults = useMutation({
    mutationFn: ({ domainId, updates }) => senderDomainsService.updateDefaults(domainId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-domains'] });
    }
  });

  const deleteDomain = useMutation({
    mutationFn: (domainId) => senderDomainsService.deleteDomain(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-domains'] });
    }
  });

  return {
    addDomain,
    verifyDomain,
    updateDefaults,
    deleteDomain
  };
}
