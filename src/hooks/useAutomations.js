// src/hooks/useAutomations.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationsService } from '../services/automations';
import { useParams } from 'react-router-dom';

const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all automations
 */
export function useAutomations(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automations', ownerId, options],
    queryFn: () => automationsService.getAll(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get all automations with enrollment stats
 */
export function useAutomationsWithStats() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automations', ownerId, 'withStats'],
    queryFn: () => automationsService.getAllWithStats(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Get a single automation by ID
 */
export function useAutomation(automationId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automation', ownerId, automationId],
    queryFn: () => automationsService.getById(ownerId, automationId),
    enabled: !!ownerId && !!automationId
  });
}

/**
 * Get automation with full details
 */
export function useAutomationWithDetails(automationId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automation', ownerId, automationId, 'details'],
    queryFn: () => automationsService.getByIdWithDetails(ownerId, automationId),
    enabled: !!ownerId && !!automationId
  });
}

/**
 * Get automation by default key
 */
export function useAutomationByKey(defaultKey) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automation', ownerId, 'key', defaultKey],
    queryFn: () => automationsService.getByDefaultKey(ownerId, defaultKey),
    enabled: !!ownerId && !!defaultKey
  });
}

/**
 * Get active automations
 */
export function useActiveAutomations() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automations', ownerId, 'active'],
    queryFn: () => automationsService.getActive(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Get automation categories
 */
export function useAutomationCategories() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['automations', ownerId, 'categories'],
    queryFn: () => automationsService.getCategories(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Automation mutations
 */
export function useAutomationMutations() {
  const ownerId = useOwnerId();
  const queryClient = useQueryClient();

  const invalidateAutomations = () => {
    queryClient.invalidateQueries({ queryKey: ['automations', ownerId] });
  };

  const createAutomation = useMutation({
    mutationFn: (automation) => automationsService.create(ownerId, automation),
    onSuccess: invalidateAutomations
  });

  const updateAutomation = useMutation({
    mutationFn: ({ automationId, updates }) => automationsService.update(ownerId, automationId, updates),
    onSuccess: (data) => {
      invalidateAutomations();
      queryClient.setQueryData(['automation', ownerId, data.id], data);
    }
  });

  const deleteAutomation = useMutation({
    mutationFn: (automationId) => automationsService.delete(ownerId, automationId),
    onSuccess: invalidateAutomations
  });

  const duplicateAutomation = useMutation({
    mutationFn: (automationId) => automationsService.duplicate(ownerId, automationId),
    onSuccess: invalidateAutomations
  });

  const activateAutomation = useMutation({
    mutationFn: (automationId) => automationsService.activate(ownerId, automationId),
    onSuccess: (data) => {
      invalidateAutomations();
      queryClient.setQueryData(['automation', ownerId, data.id], data);
    }
  });

  const pauseAutomation = useMutation({
    mutationFn: (automationId) => automationsService.pause(ownerId, automationId),
    onSuccess: (data) => {
      invalidateAutomations();
      queryClient.setQueryData(['automation', ownerId, data.id], data);
    }
  });

  const archiveAutomation = useMutation({
    mutationFn: (automationId) => automationsService.archive(ownerId, automationId),
    onSuccess: invalidateAutomations
  });

  const updateFilters = useMutation({
    mutationFn: ({ automationId, filterConfig }) => 
      automationsService.updateFilters(ownerId, automationId, filterConfig),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', ownerId, data.id], data);
    }
  });

  const updateNodes = useMutation({
    mutationFn: ({ automationId, nodes }) => 
      automationsService.updateNodes(ownerId, automationId, nodes),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', ownerId, data.id], data);
    }
  });

  const updateSchedule = useMutation({
    mutationFn: ({ automationId, scheduleConfig }) => 
      automationsService.updateSchedule(ownerId, automationId, scheduleConfig),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', ownerId, data.id], data);
    }
  });

  const updateEnrollmentRules = useMutation({
    mutationFn: ({ automationId, rules }) => 
      automationsService.updateEnrollmentRules(ownerId, automationId, rules),
    onSuccess: (data) => {
      queryClient.setQueryData(['automation', ownerId, data.id], data);
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
