// src/hooks/useTemplates.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesService } from '../services/templates';
import { useEffectiveOwner } from './useEffectiveOwner';
import { useAuth } from '../contexts/AuthContext';

/**
 * Get all templates
 */
export function useTemplates(options = {}) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['templates', filterKey, options],
    queryFn: () => templatesService.getAll(ownerIds, options),
    enabled: ownerIds.length > 0
  });
}

/**
 * Get a single template by ID
 */
export function useTemplate(templateId) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['template', filterKey, templateId],
    queryFn: () => templatesService.getById(ownerIds, templateId),
    enabled: ownerIds.length > 0 && !!templateId
  });
}

/**
 * Get template by default key
 */
export function useTemplateByKey(defaultKey) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['template', filterKey, 'key', defaultKey],
    queryFn: () => templatesService.getByDefaultKey(ownerIds, defaultKey),
    enabled: ownerIds.length > 0 && !!defaultKey
  });
}

/**
 * Get templates by category
 */
export function useTemplatesByCategory(category) {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['templates', filterKey, 'category', category],
    queryFn: () => templatesService.getByCategory(ownerIds, category),
    enabled: ownerIds.length > 0 && !!category
  });
}

/**
 * Get all template categories
 */
export function useTemplateCategories() {
  const { ownerIds, filterKey } = useEffectiveOwner();

  return useQuery({
    queryKey: ['templates', filterKey, 'categories'],
    queryFn: () => templatesService.getCategories(ownerIds),
    enabled: ownerIds.length > 0
  });
}

/**
 * Template mutations (create, update, delete, duplicate)
 */
export function useTemplateMutations() {
  const { ownerIds, filterKey } = useEffectiveOwner();
  const { canPerformActions } = useAuth();
  const queryClient = useQueryClient();

  const checkTrialAccess = () => {
    if (!canPerformActions) {
      throw new Error('Your trial has expired. Contact your administrator to activate your account.');
    }
  };

  const invalidateTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
  };

  const createTemplate = useMutation({
    mutationFn: (template) => {
      checkTrialAccess();
      return templatesService.create(ownerIds, template);
    },
    onSuccess: invalidateTemplates
  });

  const updateTemplate = useMutation({
    mutationFn: ({ templateId, updates }) => {
      checkTrialAccess();
      return templatesService.update(ownerIds, templateId, updates);
    },
    onSuccess: (data) => {
      invalidateTemplates();
      queryClient.setQueryData(['template', filterKey, data.id], data);
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: (templateId) => templatesService.delete(ownerIds, templateId),
    onSuccess: invalidateTemplates
  });

  const duplicateTemplate = useMutation({
    mutationFn: (templateId) => templatesService.duplicate(ownerIds, templateId),
    onSuccess: invalidateTemplates
  });

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate
  };
}

export default useTemplates;
