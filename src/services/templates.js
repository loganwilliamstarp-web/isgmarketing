// src/services/templates.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter, getFirstOwnerId } from './utils/ownerFilter';

export const templatesService = {
  /**
   * Get all templates for a user
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {Object} options - Query options
   * @param {string} options.category - Filter by category
   * @param {boolean} options.isDefault - Filter by default status
   * @param {string} options.search - Search in name/subject
   * @param {boolean} options.includeOwnerInfo - Include owner name/email for grouping (agency admin view)
   */
  async getAll(ownerIds, options = {}) {
    const { category, isDefault, search, includeOwnerInfo = false } = options;

    let query = supabase
      .from('email_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');
    query = applyOwnerFilter(query, ownerIds);

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

    // If we need owner info (for agency admin grouped view), fetch user details
    if (includeOwnerInfo && data && data.length > 0) {
      const uniqueOwnerIds = [...new Set(data.map(t => t.owner_id))];
      const { data: owners, error: ownerError } = await supabase
        .from('users')
        .select('user_unique_id, first_name, last_name, email')
        .in('user_unique_id', uniqueOwnerIds);

      if (ownerError) throw ownerError;

      const ownerMap = {};
      owners.forEach(owner => {
        ownerMap[owner.user_unique_id] = {
          ownerName: `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || owner.email,
          ownerEmail: owner.email
        };
      });

      return data.map(t => ({
        ...t,
        ...(ownerMap[t.owner_id] || {})
      }));
    }

    return data;
  },

  /**
   * Get a single template by ID
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getById(ownerIds, templateId) {
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Get a template by its default key
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByDefaultKey(ownerIds, defaultKey) {
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('default_key', defaultKey);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new template
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async create(ownerIds, template) {
    const ownerId = getFirstOwnerId(ownerIds);
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async update(ownerIds, templateId, updates) {
    let query = supabase
      .from('email_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.select().single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a template (only non-default templates)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async delete(ownerIds, templateId) {
    let query = supabase
      .from('email_templates')
      .delete()
      .eq('id', templateId)
      .eq('is_default', false); // Safety check
    query = applyOwnerFilter(query, ownerIds);
    const { error } = await query;

    if (error) throw error;
    return true;
  },

  /**
   * Duplicate a template
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async duplicate(ownerIds, templateId) {
    // Get the original
    const original = await this.getById(ownerIds, templateId);
    const ownerId = getFirstOwnerId(ownerIds);

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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByCategory(ownerIds, category) {
    let query = supabase
      .from('email_templates')
      .select('*')
      .eq('category', category)
      .order('is_default', { ascending: false })
      .order('name');
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get all unique categories
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getCategories(ownerIds) {
    let query = supabase
      .from('email_templates')
      .select('category')
      .not('category', 'is', null);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return [...new Set(data.map(t => t.category))];
  },

  /**
   * Reset a default template to original content
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async resetToDefault(ownerIds, templateId) {
    // This would need to store original defaults somewhere
    // For now, just return the current template
    return this.getById(ownerIds, templateId);
  }
};

export default templatesService;
