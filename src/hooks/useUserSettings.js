// src/hooks/useUserSettings.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userSettingsService } from '../services/userSettings';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get user settings (respects impersonation)
 */
export function useUserSettings() {
  const { ownerId, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['userSettings', filterKey],
    queryFn: () => userSettingsService.get(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Get user settings with user info (respects impersonation)
 */
export function useUserSettingsWithUser() {
  const { ownerId, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['userSettings', filterKey, 'withUser'],
    queryFn: () => userSettingsService.getWithUser(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Get signature HTML (respects impersonation)
 */
export function useSignatureHtml() {
  const { ownerId, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['userSettings', filterKey, 'signatureHtml'],
    queryFn: () => userSettingsService.getSignatureHtml(ownerId),
    enabled: !!ownerId
  });
}

/**
 * User settings mutations (respects impersonation)
 */
export function useUserSettingsMutations() {
  const { ownerId, filterKey } = useEffectiveOwner();
  const queryClient = useQueryClient();

  const invalidateSettings = () => {
    queryClient.invalidateQueries({ queryKey: ['userSettings', filterKey] });
  };

  const updateSettings = useMutation({
    mutationFn: (updates) => userSettingsService.update(ownerId, updates),
    onSuccess: invalidateSettings
  });

  const updateSignature = useMutation({
    mutationFn: (signature) => userSettingsService.updateSignature(ownerId, signature),
    onSuccess: invalidateSettings
  });

  const updateAgencyInfo = useMutation({
    mutationFn: (agencyInfo) => userSettingsService.updateAgencyInfo(ownerId, agencyInfo),
    onSuccess: invalidateSettings
  });

  const updateAgencyInfoByProfile = useMutation({
    mutationFn: ({ profileName, agencyInfo }) => userSettingsService.updateAgencyInfoByProfile(profileName, agencyInfo),
    onSuccess: invalidateSettings
  });

  const updateEmailSettings = useMutation({
    mutationFn: (emailSettings) => userSettingsService.updateEmailSettings(ownerId, emailSettings),
    onSuccess: invalidateSettings
  });

  const updatePreferences = useMutation({
    mutationFn: (preferences) => userSettingsService.updatePreferences(ownerId, preferences),
    onSuccess: invalidateSettings
  });

  return {
    updateSettings,
    updateSignature,
    updateAgencyInfo,
    updateAgencyInfoByProfile,
    updateEmailSettings,
    updatePreferences
  };
}

export default useUserSettings;
