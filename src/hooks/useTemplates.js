// src/hooks/useTemplates.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesService } from '../services/templates';
import { useParams } from 'react-router-dom';

// Get owner ID from URL params
const useOwnerId = () => {
  const { userId } = useParams();
  return userId;
};

/**
 * Get all templates
 */
export function useTemplates(options = {}) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['templates', ownerId, options],
    queryFn: () => templatesService.getAll(ownerId, options),
    enabled: !!ownerId
  });
}

/**
 * Get a single template by ID
 */
export function useTemplate(templateId) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['template', ownerId, templateId],
    queryFn: () => templatesService.getById(ownerId, templateId),
    enabled: !!ownerId && !!templateId
  });
}

/**
 * Get template by default key
 */
export function useTemplateByKey(defaultKey) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['template', ownerId, 'key', defaultKey],
    queryFn: () => templatesService.getByDefaultKey(ownerId, defaultKey),
    enabled: !!ownerId && !!defaultKey
  });
}

/**
 * Get templates by category
 */
export function useTemplatesByCategory(category) {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['templates', ownerId, 'category', category],
    queryFn: () => templatesService.getByCategory(ownerId, category),
    enabled: !!ownerId && !!category
  });
}

/**
 * Get all template categories
 */
export function useTemplateCategories() {
  const ownerId = useOwnerId();
  
  return useQuery({
    queryKey: ['templates', ownerId, 'categories'],
    queryFn: () => templatesService.getCategories(ownerId),
    enabled: !!ownerId
  });
}

/**
 * Template mutations (create, update, delete, duplicate)
 */
export function useTemplateMutations() {
  const ownerId = useOwnerId();
  const queryClient = useQueryClient();

  const invalidateTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['templates', ownerId] });
  };

  const createTemplate = useMutation({
    mutationFn: (template) => templatesService.create(ownerId, template),
    onSuccess: invalidateTemplates
  });

  const updateTemplate = useMutation({
    mutationFn: ({ templateId, updates }) => templatesService.update(ownerId, templateId, updates),
    onSuccess: (data) => {
      invalidateTemplates();
      queryClient.setQueryData(['template', ownerId, data.id], data);
    }
  });

  const deleteTemplate = useMutation({
    mutationFn: (templateId) => templatesService.delete(ownerId, templateId),
    onSuccess: invalidateTemplates
  });

  const duplicateTemplate = useMutation({
    mutationFn: (templateId) => templatesService.duplicate(ownerId, templateId),
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
