// src/hooks/useUserSettings.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userSettingsService } from '../services/userSettings';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get user settings
 */
export function useUserSettings() {
  const userId = useOwnerId();
  
  return useQuery({
    queryKey: ['userSettings', userId],
    queryFn: () => userSettingsService.get(userId),
    enabled: !!userId
  });
}

/**
 * Get user settings with user info
 */
export function useUserSettingsWithUser() {
  const userId = useOwnerId();
  
  return useQuery({
    queryKey: ['userSettings', userId, 'withUser'],
    queryFn: () => userSettingsService.getWithUser(userId),
    enabled: !!userId
  });
}

/**
 * Get signature HTML
 */
export function useSignatureHtml() {
  const userId = useOwnerId();
  
  return useQuery({
    queryKey: ['userSettings', userId, 'signatureHtml'],
    queryFn: () => userSettingsService.getSignatureHtml(userId),
    enabled: !!userId
  });
}

/**
 * User settings mutations
 */
export function useUserSettingsMutations() {
  const userId = useOwnerId();
  const queryClient = useQueryClient();

  const invalidateSettings = () => {
    queryClient.invalidateQueries({ queryKey: ['userSettings', userId] });
  };

  const updateSettings = useMutation({
    mutationFn: (updates) => userSettingsService.update(userId, updates),
    onSuccess: invalidateSettings
  });

  const updateSignature = useMutation({
    mutationFn: (signature) => userSettingsService.updateSignature(userId, signature),
    onSuccess: invalidateSettings
  });

  const updateAgencyInfo = useMutation({
    mutationFn: (agencyInfo) => userSettingsService.updateAgencyInfo(userId, agencyInfo),
    onSuccess: invalidateSettings
  });

  const updateAgencyInfoByProfile = useMutation({
    mutationFn: ({ profileName, agencyInfo }) => userSettingsService.updateAgencyInfoByProfile(profileName, agencyInfo),
    onSuccess: invalidateSettings
  });

  const updateEmailSettings = useMutation({
    mutationFn: (emailSettings) => userSettingsService.updateEmailSettings(userId, emailSettings),
    onSuccess: invalidateSettings
  });

  const updatePreferences = useMutation({
    mutationFn: (preferences) => userSettingsService.updatePreferences(userId, preferences),
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
