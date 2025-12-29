// src/hooks/useUnsubscribes.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { unsubscribesService } from '../services/unsubscribes';

/**
 * Get all unsubscribes
 */
export function useUnsubscribes(options = {}) {
  return useQuery({
    queryKey: ['unsubscribes', options],
    queryFn: () => unsubscribesService.getAll(options)
  });
}

/**
 * Get unsubscribes for an email
 */
export function useEmailUnsubscribes(email) {
  return useQuery({
    queryKey: ['unsubscribes', 'email', email],
    queryFn: () => unsubscribesService.getByEmail(email),
    enabled: !!email
  });
}

/**
 * Check if email is suppressed
 */
export function useIsEmailSuppressed(email, automationId = null) {
  return useQuery({
    queryKey: ['unsubscribes', 'check', email, automationId],
    queryFn: () => unsubscribesService.isEmailSuppressed(email, automationId),
    enabled: !!email
  });
}

/**
 * Get unsubscribe stats
 */
export function useUnsubscribeStats() {
  return useQuery({
    queryKey: ['unsubscribes', 'stats'],
    queryFn: () => unsubscribesService.getStats()
  });
}

/**
 * Unsubscribe mutations
 */
export function useUnsubscribeMutations() {
  const queryClient = useQueryClient();

  const invalidateUnsubscribes = () => {
    queryClient.invalidateQueries({ queryKey: ['unsubscribes'] });
  };

  const unsubscribeAll = useMutation({
    mutationFn: ({ email, source, emailLogId }) => 
      unsubscribesService.unsubscribeAll(email, source, emailLogId),
    onSuccess: invalidateUnsubscribes
  });

  const unsubscribeAutomation = useMutation({
    mutationFn: ({ email, automationId, source, emailLogId }) => 
      unsubscribesService.unsubscribeAutomation(email, automationId, source, emailLogId),
    onSuccess: invalidateUnsubscribes
  });

  const resubscribe = useMutation({
    mutationFn: (unsubscribeId) => unsubscribesService.resubscribe(unsubscribeId),
    onSuccess: invalidateUnsubscribes
  });

  const resubscribeAll = useMutation({
    mutationFn: (email) => unsubscribesService.resubscribeAll(email),
    onSuccess: invalidateUnsubscribes
  });

  const processUnsubscribe = useMutation({
    mutationFn: ({ type, emailLogId, ipAddress, userAgent }) => 
      unsubscribesService.processUnsubscribe(type, emailLogId, ipAddress, userAgent),
    onSuccess: invalidateUnsubscribes
  });

  return {
    unsubscribeAll,
    unsubscribeAutomation,
    resubscribe,
    resubscribeAll,
    processUnsubscribe
  };
}

/**
 * Hook for checking suppression before sending
 */
export function useEmailSuppression() {
  const checkSuppression = async (email, automationId = null) => {
    return unsubscribesService.isEmailSuppressed(email, automationId);
  };

  const checkBulkSuppression = async (emails, automationId = null) => {
    return unsubscribesService.checkBulkSuppression(emails, automationId);
  };

  return {
    checkSuppression,
    checkBulkSuppression
  };
}

export default useUnsubscribes;
