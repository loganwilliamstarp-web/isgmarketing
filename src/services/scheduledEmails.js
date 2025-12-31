// src/services/scheduledEmails.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter, getFirstOwnerId } from './utils/ownerFilter';

export const scheduledEmailsService = {
  /**
   * Get all scheduled emails for a user
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAll(ownerIds, options = {}) {
    const { status, automationId, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('scheduled_emails')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email),
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .order('scheduled_for', { ascending: true })
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get upcoming scheduled emails
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getUpcoming(ownerIds, limit = 10) {
    let query = supabase
      .from('scheduled_emails')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email),
        automation:automations(id, name)
      `)
      .eq('status', 'Pending')
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get scheduled emails ready to send
   */
  async getReadyToSend() {
    const { data, error } = await supabase
      .from('scheduled_emails')
      .select(`
        *,
        account:accounts(*),
        template:email_templates(*),
        automation:automations(id, name, owner_id)
      `)
      .eq('status', 'Pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  /**
   * Get a single scheduled email
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getById(ownerIds, scheduledEmailId) {
    let query = supabase
      .from('scheduled_emails')
      .select(`
        *,
        account:accounts(*),
        template:email_templates(*),
        automation:automations(id, name)
      `)
      .eq('id', scheduledEmailId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a scheduled email
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async create(ownerIds, scheduledEmail) {
    const ownerId = getFirstOwnerId(ownerIds);
    const { data, error } = await supabase
      .from('scheduled_emails')
      .insert({
        owner_id: ownerId,
        status: 'Pending',
        ...scheduledEmail
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create multiple scheduled emails
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async createBatch(ownerIds, scheduledEmails) {
    const ownerId = getFirstOwnerId(ownerIds);
    const emailsWithOwner = scheduledEmails.map(e => ({
      owner_id: ownerId,
      status: 'Pending',
      ...e
    }));

    const { data, error } = await supabase
      .from('scheduled_emails')
      .insert(emailsWithOwner)
      .select();

    if (error) throw error;
    return data;
  },

  /**
   * Update a scheduled email
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async update(ownerIds, scheduledEmailId, updates) {
    let query = supabase
      .from('scheduled_emails')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduledEmailId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.select().single();

    if (error) throw error;
    return data;
  },

  /**
   * Cancel a scheduled email
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async cancel(ownerIds, scheduledEmailId) {
    return this.update(ownerIds, scheduledEmailId, { status: 'Cancelled' });
  },

  /**
   * Reschedule an email
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async reschedule(ownerIds, scheduledEmailId, newScheduledFor) {
    return this.update(ownerIds, scheduledEmailId, {
      scheduled_for: newScheduledFor,
      status: 'Pending',
      attempts: 0
    });
  },

  /**
   * Mark as processing
   */
  async markProcessing(scheduledEmailId) {
    const { data, error } = await supabase
      .from('scheduled_emails')
      .update({
        status: 'Processing',
        last_attempt_at: new Date().toISOString(),
        attempts: supabase.sql`attempts + 1`,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduledEmailId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Mark as sent
   */
  async markSent(scheduledEmailId, emailLogId) {
    const { data, error } = await supabase
      .from('scheduled_emails')
      .update({
        status: 'Sent',
        email_log_id: emailLogId,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduledEmailId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Mark as failed
   */
  async markFailed(scheduledEmailId, errorMessage) {
    const { data: current, error: getError } = await supabase
      .from('scheduled_emails')
      .select('attempts, max_attempts')
      .eq('id', scheduledEmailId)
      .single();
    
    if (getError) throw getError;

    const shouldRetry = current.attempts < current.max_attempts;
    
    const { data, error } = await supabase
      .from('scheduled_emails')
      .update({
        status: shouldRetry ? 'Pending' : 'Failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduledEmailId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete a scheduled email
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async delete(ownerIds, scheduledEmailId) {
    let query = supabase
      .from('scheduled_emails')
      .delete()
      .eq('id', scheduledEmailId);
    query = applyOwnerFilter(query, ownerIds);
    const { error } = await query;

    if (error) throw error;
    return true;
  },

  /**
   * Get stats for scheduled emails
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getStats(ownerIds) {
    let query = supabase
      .from('scheduled_emails')
      .select('status, scheduled_for');
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;

    const now = new Date();
    const stats = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      upcomingToday: 0,
      upcomingThisWeek: 0
    };

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    data.forEach(e => {
      stats[e.status.toLowerCase()]++;
      
      if (e.status === 'Pending') {
        const scheduledDate = new Date(e.scheduled_for);
        if (scheduledDate <= endOfToday) stats.upcomingToday++;
        if (scheduledDate <= endOfWeek) stats.upcomingThisWeek++;
      }
    });

    return stats;
  }
};

export default scheduledEmailsService;
