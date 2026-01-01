// src/services/automations.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter, getFirstOwnerId } from './utils/ownerFilter';
import { automationSchedulerService } from './automationScheduler';

export const automationsService = {
  /**
   * Get all automations for a user
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAll(ownerIds, options = {}) {
    const { status, category, search } = options;

    let query = supabase
      .from('automations')
      .select(`
        *,
        _count:automation_enrollments(count)
      `)
      .order('is_default', { ascending: false })
      .order('name');
    query = applyOwnerFilter(query, ownerIds);
    
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAllWithStats(ownerIds) {
    let query = supabase
      .from('automations')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');
    query = applyOwnerFilter(query, ownerIds);
    const { data: automations, error } = await query;
    
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getById(ownerIds, automationId) {
    let query = supabase
      .from('automations')
      .select('*')
      .eq('id', automationId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Get automation with full details (enrollments, email stats)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByIdWithDetails(ownerIds, automationId) {
    const automation = await this.getById(ownerIds, automationId);
    
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByDefaultKey(ownerIds, defaultKey) {
    let query = supabase
      .from('automations')
      .select('*')
      .eq('default_key', defaultKey);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async create(ownerIds, automation) {
    const ownerId = getFirstOwnerId(ownerIds);
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
   * If the automation is active, re-evaluates scheduled emails when filter/nodes change
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async update(ownerIds, automationId, updates) {
    // Check if this is an active automation with significant changes
    const shouldRefreshSchedule = updates.filter_config !== undefined ||
      updates.nodes !== undefined ||
      updates.send_time !== undefined;

    let query = supabase
      .from('automations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', automationId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.select().single();

    if (error) throw error;

    // If active automation with significant changes, refresh the schedule
    if (shouldRefreshSchedule && data && (data.status === 'Active' || data.status === 'active')) {
      try {
        // Clear existing pending emails and regenerate
        await automationSchedulerService.cleanupAutomationSchedule(automationId);
        await automationSchedulerService.generateAutomationSchedule(automationId);
      } catch (err) {
        console.warn('Failed to refresh automation schedule after update:', err.message);
        // Don't throw - the update succeeded
      }
    }

    return data;
  },

  /**
   * Update automation status
   * Triggers schedule generation when activated, cleanup when deactivated
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async updateStatus(ownerIds, automationId, status) {
    const result = await this.update(ownerIds, automationId, { status });

    // Handle schedule generation/cleanup based on status change
    try {
      await automationSchedulerService.handleStatusChange(automationId, status);
    } catch (err) {
      console.warn('Failed to handle automation schedule:', err.message);
      // Don't throw - the status update succeeded
    }

    return result;
  },

  /**
   * Activate an automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async activate(ownerIds, automationId) {
    return this.updateStatus(ownerIds, automationId, 'active');
  },

  /**
   * Pause an automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async pause(ownerIds, automationId) {
    return this.updateStatus(ownerIds, automationId, 'paused');
  },

  /**
   * Archive an automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async archive(ownerIds, automationId) {
    return this.updateStatus(ownerIds, automationId, 'archived');
  },

  /**
   * Delete an automation (only non-default)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async delete(ownerIds, automationId) {
    let query = supabase
      .from('automations')
      .delete()
      .eq('id', automationId)
      .eq('is_default', false);
    query = applyOwnerFilter(query, ownerIds);
    const { error } = await query;

    if (error) throw error;
    return true;
  },

  /**
   * Duplicate an automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async duplicate(ownerIds, automationId) {
    const original = await this.getById(ownerIds, automationId);
    const ownerId = getFirstOwnerId(ownerIds);

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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async updateFilters(ownerIds, automationId, filterConfig) {
    return this.update(ownerIds, automationId, { filter_config: filterConfig });
  },

  /**
   * Update workflow nodes
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async updateNodes(ownerIds, automationId, nodes) {
    return this.update(ownerIds, automationId, { nodes });
  },

  /**
   * Update schedule settings
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async updateSchedule(ownerIds, automationId, scheduleConfig) {
    const { sendTime, timezone, frequency } = scheduleConfig;
    return this.update(ownerIds, automationId, {
      send_time: sendTime,
      timezone,
      frequency
    });
  },

  /**
   * Update enrollment rules
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async updateEnrollmentRules(ownerIds, automationId, rules) {
    const { maxEnrollments, cooldownDays, distributeEvenly } = rules;
    return this.update(ownerIds, automationId, {
      max_enrollments: maxEnrollments,
      enrollment_cooldown_days: cooldownDays,
      distribute_evenly: distributeEvenly
    });
  },

  /**
   * Get automations by status
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByStatus(ownerIds, status) {
    let query = supabase
      .from('automations')
      .select('*')
      .eq('status', status)
      .order('name');
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get active automations
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getActive(ownerIds) {
    return this.getByStatus(ownerIds, 'Active');
  },

  /**
   * Get all unique categories
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getCategories(ownerIds) {
    let query = supabase
      .from('automations')
      .select('category')
      .not('category', 'is', null);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return [...new Set(data.map(a => a.category))];
  }
};

export default automationsService;
