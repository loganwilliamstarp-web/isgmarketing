// src/hooks/useAdmin.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../services/admin';
import { useParams } from 'react-router-dom';

// Get owner ID from URL params
const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Check if current user is an admin
 */
export function useIsAdmin() {
  const ownerId = useOwnerId();

  return useQuery({
    queryKey: ['isAdmin', ownerId],
    queryFn: () => adminService.isAdmin(ownerId),
    enabled: !!ownerId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Get all admin users
 */
export function useAdminUsers() {
  return useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => adminService.getAdminUsers(),
  });
}

/**
 * Admin user mutations
 */
export function useAdminUserMutations() {
  const queryClient = useQueryClient();

  const addAdmin = useMutation({
    mutationFn: ({ userId, name }) => adminService.addAdmin(userId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['isAdmin'] });
    }
  });

  const removeAdmin = useMutation({
    mutationFn: (userId) => adminService.removeAdmin(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['isAdmin'] });
    }
  });

  return { addAdmin, removeAdmin };
}

// ==========================================
// Master Automations Hooks
// ==========================================

/**
 * Get all master automations
 */
export function useMasterAutomations() {
  return useQuery({
    queryKey: ['masterAutomations'],
    queryFn: () => adminService.getMasterAutomations(),
  });
}

/**
 * Get a single master automation
 */
export function useMasterAutomation(defaultKey) {
  return useQuery({
    queryKey: ['masterAutomation', defaultKey],
    queryFn: () => adminService.getMasterAutomation(defaultKey),
    enabled: !!defaultKey,
  });
}

/**
 * Master automation mutations
 */
export function useMasterAutomationMutations() {
  const queryClient = useQueryClient();

  const invalidateMasterAutomations = () => {
    queryClient.invalidateQueries({ queryKey: ['masterAutomations'] });
    queryClient.invalidateQueries({ queryKey: ['masterAutomation'] });
    // Also invalidate user automations since they may have been synced
    queryClient.invalidateQueries({ queryKey: ['automations'] });
    queryClient.invalidateQueries({ queryKey: ['automation'] });
  };

  const createMasterAutomation = useMutation({
    mutationFn: (automation) => adminService.createMasterAutomation(automation),
    onSuccess: invalidateMasterAutomations,
  });

  const updateMasterAutomation = useMutation({
    mutationFn: ({ defaultKey, updates }) => adminService.updateMasterAutomation(defaultKey, updates),
    onSuccess: invalidateMasterAutomations,
  });

  const deleteMasterAutomation = useMutation({
    mutationFn: (defaultKey) => adminService.deleteMasterAutomation(defaultKey),
    onSuccess: invalidateMasterAutomations,
  });

  const syncMasterAutomation = useMutation({
    mutationFn: (defaultKey) => adminService.syncMasterAutomation(defaultKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation'] });
    },
  });

  const syncAllMasterAutomations = useMutation({
    mutationFn: () => adminService.syncAllMasterAutomations(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation'] });
    },
  });

  return {
    createMasterAutomation,
    updateMasterAutomation,
    deleteMasterAutomation,
    syncMasterAutomation,
    syncAllMasterAutomations,
  };
}

// ==========================================
// Master Templates Hooks
// ==========================================

/**
 * Get all master templates
 */
export function useMasterTemplates() {
  return useQuery({
    queryKey: ['masterTemplates'],
    queryFn: () => adminService.getMasterTemplates(),
  });
}

/**
 * Get a single master template
 */
export function useMasterTemplate(defaultKey) {
  return useQuery({
    queryKey: ['masterTemplate', defaultKey],
    queryFn: () => adminService.getMasterTemplate(defaultKey),
    enabled: !!defaultKey,
  });
}

/**
 * Master template mutations
 */
export function useMasterTemplateMutations() {
  const queryClient = useQueryClient();

  const invalidateMasterTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['masterTemplates'] });
    queryClient.invalidateQueries({ queryKey: ['masterTemplate'] });
    // Also invalidate user templates since they may have been synced
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.invalidateQueries({ queryKey: ['template'] });
  };

  const createMasterTemplate = useMutation({
    mutationFn: (template) => adminService.createMasterTemplate(template),
    onSuccess: invalidateMasterTemplates,
  });

  const updateMasterTemplate = useMutation({
    mutationFn: ({ defaultKey, updates }) => adminService.updateMasterTemplate(defaultKey, updates),
    onSuccess: invalidateMasterTemplates,
  });

  const deleteMasterTemplate = useMutation({
    mutationFn: (defaultKey) => adminService.deleteMasterTemplate(defaultKey),
    onSuccess: invalidateMasterTemplates,
  });

  const syncMasterTemplate = useMutation({
    mutationFn: (defaultKey) => adminService.syncMasterTemplate(defaultKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template'] });
    },
  });

  const syncAllMasterTemplates = useMutation({
    mutationFn: () => adminService.syncAllMasterTemplates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template'] });
    },
  });

  return {
    createMasterTemplate,
    updateMasterTemplate,
    deleteMasterTemplate,
    syncMasterTemplate,
    syncAllMasterTemplates,
  };
}

export default useIsAdmin;
