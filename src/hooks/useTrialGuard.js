// src/hooks/useTrialGuard.js
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for checking if user can perform actions based on trial status
 *
 * Returns:
 * - canPerformActions: boolean - true if user can create/edit/send
 * - isReadOnly: boolean - true if user is in read-only mode (trial expired)
 * - trialMessage: string - message to show when action is blocked
 */
export function useTrialGuard() {
  const { accessType, canPerformActions, isTrialExpired } = useAuth();

  return {
    canPerformActions,
    isReadOnly: isTrialExpired,
    trialMessage: isTrialExpired
      ? 'Your trial has expired. Contact your administrator to activate your account.'
      : null,
  };
}

export default useTrialGuard;
