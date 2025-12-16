// src/hooks/useEnrollments.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enrollmentsService } from '../services/enrollments';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get enrollments for an automation
 */
export function useAutomationEnrollments(automationId, options = {}) {
  return useQuery({
    queryKey: ['enrollments', 'automation', automationId, options],
    queryFn: () => enrollmentsService.getByAutomation(automationId, options),
    enabled: !!automationId
  });
}

/**
 * Get enrollments for an account
 */
export function useAccountEnrollments(accountId, options = {}) {
  return useQuery({
    queryKey: ['enrollments', 'account', accountId, options],
    queryFn: () => enrollmentsService.getByAccount(accountId, options),
    enabled: !!accountId
  });
}

/**
 * Get a single enrollment
 */
export function useEnrollment(enrollmentId) {
  return useQuery({
    queryKey: ['enrollment', enrollmentId],
    queryFn: () => enrollmentsService.getById(enrollmentId),
    enabled: !!enrollmentId
  });
}

/**
 * Get enrollment stats for an automation
 */
export function useEnrollmentStats(automationId) {
  return useQuery({
    queryKey: ['enrollments', 'stats', automationId],
    queryFn: () => enrollmentsService.getStats(automationId),
    enabled: !!automationId
  });
}

/**
 * Get enrollment history
 */
export function useEnrollmentHistory(enrollmentId) {
  return useQuery({
    queryKey: ['enrollment', enrollmentId, 'history'],
    queryFn: () => enrollmentsService.getHistory(enrollmentId),
    enabled: !!enrollmentId
  });
}

/**
 * Check if account can enroll
 */
export function useCanEnroll(accountId, automationId) {
  return useQuery({
    queryKey: ['canEnroll', accountId, automationId],
    queryFn: () => enrollmentsService.canEnroll(accountId, automationId),
    enabled: !!accountId && !!automationId
  });
}

/**
 * Get enrollments ready for action (for automation engine)
 */
export function useReadyEnrollments() {
  return useQuery({
    queryKey: ['enrollments', 'ready'],
    queryFn: () => enrollmentsService.getReadyForAction(),
    refetchInterval: 60000 // Refetch every minute
  });
}

/**
 * Enrollment mutations
 */
export function useEnrollmentMutations() {
  const queryClient = useQueryClient();

  const invalidateEnrollments = (automationId, accountId) => {
    queryClient.invalidateQueries({ queryKey: ['enrollments', 'automation', automationId] });
    if (accountId) {
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'account', accountId] });
    }
    queryClient.invalidateQueries({ queryKey: ['enrollments', 'stats', automationId] });
  };

  const enroll = useMutation({
    mutationFn: ({ automationId, accountId, metadata }) => 
      enrollmentsService.enroll(automationId, accountId, metadata),
    onSuccess: (data) => {
      invalidateEnrollments(data.automation_id, data.account_id);
    }
  });

  const bulkEnroll = useMutation({
    mutationFn: ({ automationId, accountIds }) => 
      enrollmentsService.bulkEnroll(automationId, accountIds),
    onSuccess: (_, variables) => {
      invalidateEnrollments(variables.automationId);
    }
  });

  const exitEnrollment = useMutation({
    mutationFn: ({ enrollmentId, reason }) => 
      enrollmentsService.exit(enrollmentId, reason),
    onSuccess: (data) => {
      invalidateEnrollments(data.automation_id, data.account_id);
      queryClient.setQueryData(['enrollment', data.id], data);
    }
  });

  const pauseEnrollment = useMutation({
    mutationFn: (enrollmentId) => enrollmentsService.pause(enrollmentId),
    onSuccess: (data) => {
      invalidateEnrollments(data.automation_id, data.account_id);
      queryClient.setQueryData(['enrollment', data.id], data);
    }
  });

  const resumeEnrollment = useMutation({
    mutationFn: (enrollmentId) => enrollmentsService.resume(enrollmentId),
    onSuccess: (data) => {
      invalidateEnrollments(data.automation_id, data.account_id);
      queryClient.setQueryData(['enrollment', data.id], data);
    }
  });

  const completeEnrollment = useMutation({
    mutationFn: (enrollmentId) => enrollmentsService.complete(enrollmentId),
    onSuccess: (data) => {
      invalidateEnrollments(data.automation_id, data.account_id);
      queryClient.setQueryData(['enrollment', data.id], data);
    }
  });

  const updateProgress = useMutation({
    mutationFn: ({ enrollmentId, nodeId, branch }) => 
      enrollmentsService.updateProgress(enrollmentId, nodeId, branch),
    onSuccess: (data) => {
      queryClient.setQueryData(['enrollment', data.id], data);
    }
  });

  return {
    enroll,
    bulkEnroll,
    exitEnrollment,
    pauseEnrollment,
    resumeEnrollment,
    completeEnrollment,
    updateProgress
  };
}

export default useAutomationEnrollments;
