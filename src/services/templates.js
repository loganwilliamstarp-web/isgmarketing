// src/services/templates.js
import { supabase } from '../lib/supabase';

export const templatesService = {
  /**
   * Get all templates for a user
   */
  async getAll(ownerId, options = {}) {
    const { category, isDefault, search } = options;
    
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('owner_id', ownerId)
      .order('is_default', { ascending: false })
      .order('name');
    
    if (category) {
      query = query.eq('category', category);
    }
    
    if (typeof isDefault === 'boolean') {
      query = query.eq('is_default', isDefault);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,subject.ilike.%${search}%`);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get a single template by ID
   */
  async getById(ownerId, templateId) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('id', templateId)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get a template by its default key
   */
  async getByDefaultKey(ownerId, defaultKey) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('default_key', defaultKey)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Create a new template
   */
  async create(ownerId, template) {
    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        owner_id: ownerId,
        is_default: false,
        ...template
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update a template
   */
  async update(ownerId, templateId, updates) {
    const { data, error } = await supabase
      .from('email_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('id', templateId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete a template (only non-default templates)
   */
  async delete(ownerId, templateId) {
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('owner_id', ownerId)
      .eq('id', templateId)
      .eq('is_default', false); // Safety check
    
    if (error) throw error;
    return true;
  },

  /**
   * Duplicate a template
   */
  async duplicate(ownerId, templateId) {
    // Get the original
    const original = await this.getById(ownerId, templateId);
    
    // Create a copy
    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        owner_id: ownerId,
        is_default: false,
        default_key: null,
        name: `${original.name} (Copy)`,
        subject: original.subject,
        body_html: original.body_html,
        body_text: original.body_text,
        category: original.category,
        merge_fields: original.merge_fields
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get templates by category
   */
  async getByCategory(ownerId, category) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('category', category)
      .order('is_default', { ascending: false })
      .order('name');
    
    if (error) throw error;
    return data;
  },

  /**
   * Get all unique categories
   */
  async getCategories(ownerId) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('category')
      .eq('owner_id', ownerId)
      .not('category', 'is', null);
    
    if (error) throw error;
    return [...new Set(data.map(t => t.category))];
  },

  /**
   * Reset a default template to original content
   */
  async resetToDefault(ownerId, templateId) {
    // This would need to store original defaults somewhere
    // For now, just return the current template
    return this.getById(ownerId, templateId);
  }
};

export default templatesService;
