// src/services/automations.js
import { supabase } from '../lib/supabase';

export const automationsService = {
  /**
   * Get all automations for a user
   */
  async getAll(ownerId, options = {}) {
    const { status, category, search } = options;
    
    let query = supabase
      .from('automations')
      .select(`
        *,
        _count:automation_enrollments(count)
      `)
      .eq('owner_id', ownerId)
      .order('is_default', { ascending: false })
      .order('name');
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (category) {
      query = query.eq('category', category);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get all automations with enrollment stats
   */
  async getAllWithStats(ownerId) {
    const { data: automations, error } = await supabase
      .from('automations')
      .select('*')
      .eq('owner_id', ownerId)
      .order('is_default', { ascending: false })
      .order('name');
    
    if (error) throw error;

    // Get enrollment counts for each automation
    const automationIds = automations.map(a => a.id);
    
    const { data: enrollmentCounts, error: countError } = await supabase
      .from('automation_enrollments')
      .select('automation_id, status')
      .in('automation_id', automationIds);
    
    if (countError) throw countError;

    // Calculate stats per automation
    const statsMap = {};
    enrollmentCounts.forEach(e => {
      if (!statsMap[e.automation_id]) {
        statsMap[e.automation_id] = { total: 0, active: 0, completed: 0, exited: 0 };
      }
      statsMap[e.automation_id].total++;
      statsMap[e.automation_id][e.status.toLowerCase()]++;
    });

    return automations.map(a => ({
      ...a,
      enrollmentStats: statsMap[a.id] || { total: 0, active: 0, completed: 0, exited: 0 }
    }));
  },

  /**
   * Get a single automation by ID
   */
  async getById(ownerId, automationId) {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('id', automationId)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get automation with full details (enrollments, email stats)
   */
  async getByIdWithDetails(ownerId, automationId) {
    const automation = await this.getById(ownerId, automationId);
    
    // Get enrollment stats
    const { data: enrollments, error: enrollError } = await supabase
      .from('automation_enrollments')
      .select('status')
      .eq('automation_id', automationId);
    
    if (enrollError) throw enrollError;

    const enrollmentStats = {
      total: enrollments.length,
      active: enrollments.filter(e => e.status === 'Active').length,
      completed: enrollments.filter(e => e.status === 'Completed').length,
      exited: enrollments.filter(e => e.status === 'Exited').length,
      paused: enrollments.filter(e => e.status === 'Paused').length
    };

    // Get email stats
    const { data: emailStats, error: emailError } = await supabase
      .from('email_logs')
      .select('status, open_count, click_count')
      .eq('automation_id', automationId);
    
    if (emailError) throw emailError;

    const emailSummary = {
      sent: emailStats.length,
      delivered: emailStats.filter(e => e.status === 'Delivered' || e.status === 'Opened' || e.status === 'Clicked').length,
      opened: emailStats.filter(e => e.open_count > 0).length,
      clicked: emailStats.filter(e => e.click_count > 0).length,
      bounced: emailStats.filter(e => e.status === 'Bounced').length
    };

    return {
      ...automation,
      enrollmentStats,
      emailSummary
    };
  },

  /**
   * Get automation by default key
   */
  async getByDefaultKey(ownerId, defaultKey) {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('default_key', defaultKey)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Create a new automation
   */
  async create(ownerId, automation) {
    const { data, error } = await supabase
      .from('automations')
      .insert({
        owner_id: ownerId,
        is_default: false,
        status: 'Draft',
        ...automation
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update an automation
   */
  async update(ownerId, automationId, updates) {
    const { data, error } = await supabase
      .from('automations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('id', automationId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update automation status
   */
  async updateStatus(ownerId, automationId, status) {
    return this.update(ownerId, automationId, { status });
  },

  /**
   * Activate an automation
   */
  async activate(ownerId, automationId) {
    return this.updateStatus(ownerId, automationId, 'Active');
  },

  /**
   * Pause an automation
   */
  async pause(ownerId, automationId) {
    return this.updateStatus(ownerId, automationId, 'Paused');
  },

  /**
   * Archive an automation
   */
  async archive(ownerId, automationId) {
    return this.updateStatus(ownerId, automationId, 'Archived');
  },

  /**
   * Delete an automation (only non-default)
   */
  async delete(ownerId, automationId) {
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('owner_id', ownerId)
      .eq('id', automationId)
      .eq('is_default', false);
    
    if (error) throw error;
    return true;
  },

  /**
   * Duplicate an automation
   */
  async duplicate(ownerId, automationId) {
    const original = await this.getById(ownerId, automationId);
    
    const { data, error } = await supabase
      .from('automations')
      .insert({
        owner_id: ownerId,
        is_default: false,
        default_key: null,
        name: `${original.name} (Copy)`,
        description: original.description,
        category: original.category,
        status: 'Draft',
        send_time: original.send_time,
        timezone: original.timezone,
        frequency: original.frequency,
        max_enrollments: original.max_enrollments,
        enrollment_cooldown_days: original.enrollment_cooldown_days,
        distribute_evenly: original.distribute_evenly,
        filter_config: original.filter_config,
        nodes: original.nodes
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update filter configuration
   */
  async updateFilters(ownerId, automationId, filterConfig) {
    return this.update(ownerId, automationId, { filter_config: filterConfig });
  },

  /**
   * Update workflow nodes
   */
  async updateNodes(ownerId, automationId, nodes) {
    return this.update(ownerId, automationId, { nodes });
  },

  /**
   * Update schedule settings
   */
  async updateSchedule(ownerId, automationId, scheduleConfig) {
    const { sendTime, timezone, frequency } = scheduleConfig;
    return this.update(ownerId, automationId, {
      send_time: sendTime,
      timezone,
      frequency
    });
  },

  /**
   * Update enrollment rules
   */
  async updateEnrollmentRules(ownerId, automationId, rules) {
    const { maxEnrollments, cooldownDays, distributeEvenly } = rules;
    return this.update(ownerId, automationId, {
      max_enrollments: maxEnrollments,
      enrollment_cooldown_days: cooldownDays,
      distribute_evenly: distributeEvenly
    });
  },

  /**
   * Get automations by status
   */
  async getByStatus(ownerId, status) {
    const { data, error } = await supabase
      .from('automations')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('status', status)
      .order('name');
    
    if (error) throw error;
    return data;
  },

  /**
   * Get active automations
   */
  async getActive(ownerId) {
    return this.getByStatus(ownerId, 'Active');
  },

  /**
   * Get all unique categories
   */
  async getCategories(ownerId) {
    const { data, error } = await supabase
      .from('automations')
      .select('category')
      .eq('owner_id', ownerId)
      .not('category', 'is', null);
    
    if (error) throw error;
    return [...new Set(data.map(a => a.category))];
  }
};

export default automationsService;
