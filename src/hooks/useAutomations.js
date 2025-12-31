// src/hooks/useAutomations.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationsService } from '../services/automations';
import { useEffectiveOwner } from './useEffectiveOwner';

/**
 * Get all automations
 */
export function useAutomations(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automations', filterKey, options],
    queryFn: () => automationsService.getAll(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get all automations with enrollment stats
 */
export function useAutomationsWithStats() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automations', filterKey, 'withStats'],
    queryFn: () => automationsService.getAllWithStats(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get a single automation by ID
 */
export function useAutomation(automationId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automation', filterKey, automationId],
    queryFn: () => automationsService.getById(ownerIds, automationId),
    enabled: ownerIds.length > 0 && !!automationId
  });
}

/**
 * Get automation with full details
 */
export function useAutomationWithDetails(automationId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automation', filterKey, automationId, 'details'],
    queryFn: () => automationsService.getByIdWithDetails(ownerIds, automationId),
    enabled: ownerIds.length > 0 && !!automationId
  });
}

/**
 * Get automation by default key
 */
export function useAutomationByKey(defaultKey) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automation', filterKey, 'key', defaultKey],
    queryFn: () => automationsService.getByDefaultKey(ownerIds, defaultKey),
    enabled: ownerIds.length > 0 && !!defaultKey
  });
}

/**
 * Get active automations
 */
export function useActiveAutomations() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automations', filterKey, 'active'],
    queryFn: () => automationsService.getActive(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get automation categories
 */
export function useAutomationCategories() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['automations', filterKey, 'categories'],
    queryFn: () => automationsService.getCategories(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Automation mutations
 */
export function useAutomationMutations() {
  const { ownerIds, filterKey } = useEffectiveOwner();
  const queryClient = useQueryClient();

  const invalidateAutomations = () => {
    queryClient.invalidateQueries({ queryKey: ['automations'] });
  };

  const createAutomation = useMutation({
    mutationFn: (automation) => automationsService.create(ownerIds, automation),
    onSuccess: invalidateAutomations
  });

  const updateAutomation = useMutation({
    mutationFn: ({ automationId, updates }) => automationsService.update(ownerIds, automationId, updates),
    onSuccess: (data) => {
      invalidateAutomations();
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  const deleteAutomation = useMutation({
    mutationFn: (automationId) => automationsService.delete(ownerIds, automationId),
    onSuccess: invalidateAutomations
  });

  const duplicateAutomation = useMutation({
    mutationFn: (automationId) => automationsService.duplicate(ownerIds, automationId),
    onSuccess: invalidateAutomations
  });

  const activateAutomation = useMutation({
    mutationFn: (automationId) => automationsService.activate(ownerIds, automationId),
    onSuccess: (data) => {
      invalidateAutomations();
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  const pauseAutomation = useMutation({
    mutationFn: (automationId) => automationsService.pause(ownerIds, automationId),
    onSuccess: (data) => {
      invalidateAutomations();
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  const archiveAutomation = useMutation({
    mutationFn: (automationId) => automationsService.archive(ownerIds, automationId),
    onSuccess: invalidateAutomations
  });

  const updateFilters = useMutation({
    mutationFn: ({ automationId, filterConfig }) =>
      automationsService.updateFilters(ownerIds, automationId, filterConfig),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  const updateNodes = useMutation({
    mutationFn: ({ automationId, nodes }) =>
      automationsService.updateNodes(ownerIds, automationId, nodes),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  const updateSchedule = useMutation({
    mutationFn: ({ automationId, scheduleConfig }) =>
      automationsService.updateSchedule(ownerIds, automationId, scheduleConfig),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  const updateEnrollmentRules = useMutation({
    mutationFn: ({ automationId, rules }) =>
      automationsService.updateEnrollmentRules(ownerIds, automationId, rules),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', filterKey, data.id], data);
    }
  });

  return {
    createAutomation,
    updateAutomation,
    deleteAutomation,
    duplicateAutomation,
    activateAutomation,
    pauseAutomation,
    archiveAutomation,
    updateFilters,
    updateNodes,
    updateSchedule,
    updateEnrollmentRules
  };
}

export default useAutomations;
