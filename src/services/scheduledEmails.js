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
    // Get emails scheduled from start of today (not current time) to include same-day emails
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let query = supabase
      .from('scheduled_emails')
      .select(`
        *,
        template:email_templates(id, name, subject, body_html, body_text),
        automation:automations(id, name)
      `)
      .eq('status', 'Pending')
      .gte('scheduled_for', startOfToday.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    console.log('getUpcoming query result:', { data, error, ownerIds, startOfToday: startOfToday.toISOString() });

    if (error) throw error;
    return data;
  },

  /**
   * Get scheduled emails ready to send
   * Excludes emails that still require 24-hour verification
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
      .or('requires_verification.is.null,requires_verification.eq.false') // Only send verified emails
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
   * Mark as skipped (for deduplication)
   */
  async markSkipped(scheduledEmailId, reason) {
    const { data, error } = await supabase
      .from('scheduled_emails')
      .update({
        status: 'Cancelled',
        error_message: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', scheduledEmailId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Check if template was recently sent to this email (within 7 days)
   * Used for template-level deduplication
   * @param {string} templateId - The template ID
   * @param {string} recipientEmail - The recipient email address
   * @param {number} days - Number of days to look back (default 7)
   * @returns {Promise<boolean>} True if template was recently sent
   */
  async wasRecentlySent(templateId, recipientEmail, days = 7) {
    if (!templateId || !recipientEmail) return false;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from('email_logs')
      .select('id')
      .eq('template_id', templateId)
      .ilike('to_email', recipientEmail.trim())
      .gte('sent_at', cutoffDate.toISOString())
      .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
      .limit(1);

    if (error) {
      console.warn('Failed to check recent sends:', error);
      return false; // Fail open - allow send if check fails
    }

    return data && data.length > 0;
  },

  /**
   * Get scheduled emails ready to send, filtered by template deduplication
   * Skips emails where the template was sent to this recipient in the last 7 days
   */
  async getReadyToSendFiltered() {
    const readyEmails = await this.getReadyToSend();

    if (!readyEmails || readyEmails.length === 0) {
      return { eligible: [], skipped: [] };
    }

    const eligible = [];
    const skipped = [];

    for (const email of readyEmails) {
      const recipientEmail = email.recipient_email || email.account?.person_email || email.account?.email;

      if (email.template_id && recipientEmail) {
        const recentlySent = await this.wasRecentlySent(email.template_id, recipientEmail);

        if (recentlySent) {
          // Mark as skipped and add to skipped list
          await this.markSkipped(email.id, 'Template already sent to this recipient within 7 days');
          skipped.push(email);
          continue;
        }
      }

      eligible.push(email);
    }

    return { eligible, skipped };
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
