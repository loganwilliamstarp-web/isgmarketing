// src/services/admin.js
import { supabase } from '../lib/supabase';

export const adminService = {
  /**
   * Check if a user is an admin
   */
  async isAdmin(userId) {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }
    return !!data;
  },

  /**
   * Get all admin users
   */
  async getAdminUsers() {
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .order('created_at');

    if (error) throw error;
    return data;
  },

  /**
   * Add an admin user
   */
  async addAdmin(userId, name = null) {
    const { data, error } = await supabase
      .from('admin_users')
      .insert({ user_id: userId, name })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Remove an admin user
   */
  async removeAdmin(userId) {
    const { error } = await supabase
      .from('admin_users')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  },

  /**
   * Get all users (for admin impersonation picker)
   */
  async getAllUsers(searchQuery = '') {
    let query = supabase
      .from('users')
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name')
      .order('first_name');

    // Add search filter if query provided
    if (searchQuery) {
      query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
    }

    // Limit results
    query = query.limit(50);

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  // ==========================================
  // Master Automations
  // ==========================================

  /**
   * Get all master automations
   */
  async getMasterAutomations() {
    const { data, error } = await supabase
      .from('master_automations')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  },

  /**
   * Get a master automation by default_key
   */
  async getMasterAutomation(defaultKey) {
    const { data, error } = await supabase
      .from('master_automations')
      .select('*')
      .eq('default_key', defaultKey)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new master automation
   */
  async createMasterAutomation(automation) {
    const { data, error } = await supabase
      .from('master_automations')
      .insert(automation)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a master automation and sync to all users
   * If the master automation doesn't exist, create it first
   */
  async updateMasterAutomation(defaultKey, updates) {
    // First check if master automation exists
    const { data: existing } = await supabase
      .from('master_automations')
      .select('id')
      .eq('default_key', defaultKey)
      .single();

    let data;
    let error;

    if (existing) {
      // Update existing master automation
      const result = await supabase
        .from('master_automations')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('default_key', defaultKey)
        .select()
        .single();

      data = result.data;
      error = result.error;
    } else {
      // Create new master automation from the updates
      const result = await supabase
        .from('master_automations')
        .insert({
          default_key: defaultKey,
          ...updates,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    // Explicitly sync to all users
    await supabase.rpc('sync_master_automation_to_users', { p_default_key: defaultKey });

    return data;
  },

  /**
   * Delete a master automation
   */
  async deleteMasterAutomation(defaultKey) {
    const { error } = await supabase
      .from('master_automations')
      .delete()
      .eq('default_key', defaultKey);

    if (error) throw error;
    return true;
  },

  /**
   * Manually trigger sync for a master automation
   */
  async syncMasterAutomation(defaultKey) {
    const { data, error } = await supabase
      .rpc('sync_master_automation_to_users', { p_default_key: defaultKey });

    if (error) throw error;
    return data; // Returns count of users updated
  },

  /**
   * Sync all master automations to all users
   */
  async syncAllMasterAutomations() {
    const { data, error } = await supabase
      .rpc('sync_all_master_automations');

    if (error) throw error;
    return data;
  },

  // ==========================================
  // Master Templates
  // ==========================================

  /**
   * Get all master templates
   */
  async getMasterTemplates() {
    const { data, error } = await supabase
      .from('master_templates')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  },

  /**
   * Get a master template by default_key
   */
  async getMasterTemplate(defaultKey) {
    const { data, error } = await supabase
      .from('master_templates')
      .select('*')
      .eq('default_key', defaultKey)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new master template
   */
  async createMasterTemplate(template) {
    const { data, error } = await supabase
      .from('master_templates')
      .insert(template)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a master template (triggers sync to all users)
   */
  async updateMasterTemplate(defaultKey, updates) {
    const { data, error } = await supabase
      .from('master_templates')
      .update(updates)
      .eq('default_key', defaultKey)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a master template
   */
  async deleteMasterTemplate(defaultKey) {
    const { error } = await supabase
      .from('master_templates')
      .delete()
      .eq('default_key', defaultKey);

    if (error) throw error;
    return true;
  },

  /**
   * Manually trigger sync for a master template
   */
  async syncMasterTemplate(defaultKey) {
    const { data, error } = await supabase
      .rpc('sync_master_template_to_users', { p_default_key: defaultKey });

    if (error) throw error;
    return data;
  },

  /**
   * Sync all master templates to all users
   */
  async syncAllMasterTemplates() {
    const { data, error } = await supabase
      .rpc('sync_all_master_templates');

    if (error) throw error;
    return data;
  }
};

export default adminService;
