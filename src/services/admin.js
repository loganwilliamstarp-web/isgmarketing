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
      .maybeSingle();

    if (error) {
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
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name, marketing_cloud_agency_admin')
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

  /**
   * Get all unique agencies (profile_names) for Master Admin dropdown
   */
  async getUniqueAgencies() {
    const { data, error } = await supabase
      .from('users')
      .select('profile_name')
      .not('profile_name', 'is', null)
      .order('profile_name');

    if (error) throw error;

    // Deduplicate and return unique values
    const unique = [...new Set(data?.map(u => u.profile_name))];
    return unique.filter(Boolean);
  },

  /**
   * Get all users belonging to a specific agency (profile_name)
   */
  async getUsersByAgency(profileName) {
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name, marketing_cloud_agency_admin')
      .eq('profile_name', profileName)
      .order('first_name');

    if (error) throw error;
    return data || [];
  },

  /**
   * Get all user IDs belonging to a specific agency (for query filtering)
   */
  async getUserIdsByAgency(profileName) {
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id')
      .eq('profile_name', profileName);

    if (error) throw error;
    return data?.map(u => u.user_unique_id) || [];
  },

  /**
   * Get all user IDs (for Master Admin "All Agencies" filter)
   */
  async getAllUserIds() {
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id');

    if (error) throw error;
    return data?.map(u => u.user_unique_id) || [];
  },

  /**
   * Get agents in the same agency as the current user (for Agency Admin dropdown)
   * Excludes the current user from the list
   */
  async getAgencyAgents(profileName, excludeUserId = null, searchQuery = '') {
    let query = supabase
      .from('users')
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name')
      .eq('profile_name', profileName)
      .order('first_name');

    // Exclude the current user if provided
    if (excludeUserId) {
      query = query.neq('user_unique_id', excludeUserId);
    }

    // Add search filter if query provided
    if (searchQuery) {
      query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
    }

    query = query.limit(50);

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  /**
   * Check if a user is an agency admin
   */
  async isAgencyAdmin(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('marketing_cloud_agency_admin')
      .eq('user_unique_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return data?.marketing_cloud_agency_admin === true;
  },

  /**
   * Get user's profile name (agency)
   */
  async getUserProfileName(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('profile_name')
      .eq('user_unique_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return data?.profile_name || null;
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
   * Writes go through a SECURITY DEFINER RPC because RLS blocks direct writes
   * to master_automations for the app role (see 20260520000001 migration).
   */
  async createMasterAutomation(automation, userId) {
    const { data, error } = await supabase.rpc('admin_create_master_automation', {
      p_user_id: userId,
      p_automation: automation,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Update a master automation and sync to all users
   * If the master automation doesn't exist, the RPC creates it. The RPC also
   * pushes the changes down to every user's copy.
   */
  async updateMasterAutomation(defaultKey, updates, userId) {
    const { data, error } = await supabase.rpc('admin_update_master_automation', {
      p_user_id: userId,
      p_default_key: defaultKey,
      p_updates: updates,
    });

    if (error) throw error;
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
   * Writes go through a SECURITY DEFINER RPC because RLS blocks direct writes
   * to master_templates for the app role (see 20260520000001 migration).
   */
  async createMasterTemplate(template, userId) {
    const { data, error } = await supabase.rpc('admin_create_master_template', {
      p_user_id: userId,
      p_template: template,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Update a master template
   */
  async updateMasterTemplate(defaultKey, updates, userId) {
    const { data, error } = await supabase.rpc('admin_update_master_template', {
      p_user_id: userId,
      p_default_key: defaultKey,
      p_updates: updates,
    });

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
