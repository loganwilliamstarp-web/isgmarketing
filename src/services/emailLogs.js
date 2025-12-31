// src/services/emailLogs.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter, getFirstOwnerId } from './utils/ownerFilter';

export const emailLogsService = {
  /**
   * Get all email logs for a user
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAll(ownerIds, options = {}) {
    const { status, automationId, accountId, limit = 50, offset = 0, startDate, endDate } = options;

    let query = supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email, primary_contact_first_name),
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }
    
    if (accountId) {
      query = query.eq('account_id', accountId);
    }
    
    if (startDate) {
      query = query.gte('sent_at', startDate);
    }
    
    if (endDate) {
      query = query.lte('sent_at', endDate);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get a single email log by ID
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getById(ownerIds, emailLogId) {
    let query = supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(*),
        template:email_templates(*),
        automation:automations(id, name),
        enrollment:automation_enrollments(id, status)
      `)
      .eq('id', emailLogId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Get email log with all events
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByIdWithEvents(ownerIds, emailLogId) {
    const emailLog = await this.getById(ownerIds, emailLogId);
    
    const { data: events, error } = await supabase
      .from('email_events')
      .select('*')
      .eq('email_log_id', emailLogId)
      .order('event_timestamp', { ascending: true });
    
    if (error) throw error;
    
    return {
      ...emailLog,
      events
    };
  },

  /**
   * Get emails for a specific account
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByAccount(ownerIds, accountId, options = {}) {
    const { limit = 20 } = options;

    let query = supabase
      .from('email_logs')
      .select(`
        *,
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get emails for a specific automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByAutomation(ownerIds, automationId, options = {}) {
    const { limit = 50, offset = 0, status } = options;

    let query = supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('automation_id', automationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Create a new email log
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async create(ownerIds, emailLog) {
    const ownerId = getFirstOwnerId(ownerIds);
    const { data, error } = await supabase
      .from('email_logs')
      .insert({
        owner_id: ownerId,
        status: 'Queued',
        ...emailLog
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update email log status
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async updateStatus(ownerIds, emailLogId, status, additionalData = {}) {
    let query = supabase
      .from('email_logs')
      .update({
        status,
        ...additionalData,
        updated_at: new Date().toISOString()
      })
      .eq('id', emailLogId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.select().single();

    if (error) throw error;
    return data;
  },

  /**
   * Mark as sent
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async markSent(ownerIds, emailLogId, sendgridMessageId) {
    return this.updateStatus(ownerIds, emailLogId, 'Sent', {
      sent_at: new Date().toISOString(),
      sendgrid_message_id: sendgridMessageId
    });
  },

  /**
   * Mark as failed
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async markFailed(ownerIds, emailLogId, errorMessage, errorCode = null) {
    return this.updateStatus(ownerIds, emailLogId, 'Failed', {
      failed_at: new Date().toISOString(),
      error_message: errorMessage,
      error_code: errorCode
    });
  },

  /**
   * Get recent opens
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getRecentOpens(ownerIds, limit = 10) {
    let query = supabase
      .from('email_logs')
      .select(`
        id, subject, first_opened_at, open_count,
        account:accounts(account_unique_id, name, person_email)
      `)
      .not('first_opened_at', 'is', null)
      .order('first_opened_at', { ascending: false })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get recent clicks
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getRecentClicks(ownerIds, limit = 10) {
    let query = supabase
      .from('email_logs')
      .select(`
        id, subject, first_clicked_at, click_count,
        account:accounts(account_unique_id, name, person_email)
      `)
      .not('first_clicked_at', 'is', null)
      .order('first_clicked_at', { ascending: false })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get bounced emails
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getBounces(ownerIds, options = {}) {
    const { limit = 50, offset = 0 } = options;

    let query = supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('status', 'Bounced')
      .order('bounced_at', { ascending: false })
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get email stats for date range
   * Note: RPC function may need to be updated to support multiple owner IDs
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getStats(ownerIds, startDate, endDate, automationId = null) {
    // For RPC, we need to use first owner ID since RPC typically expects single value
    const ownerId = getFirstOwnerId(ownerIds);
    const { data, error } = await supabase
      .rpc('get_email_stats', {
        p_owner_id: ownerId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_automation_id: automationId
      });

    if (error) throw error;
    return data?.[0] || {
      total_sent: 0,
      total_delivered: 0,
      total_opened: 0,
      unique_opens: 0,
      total_clicked: 0,
      unique_clicks: 0,
      total_bounced: 0,
      open_rate: 0,
      click_rate: 0
    };
  },

  /**
   * Get daily stats
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getDailyStats(ownerIds, startDate, endDate, automationId = null) {
    let query = supabase
      .from('email_stats_daily')
      .select('*')
      .gte('stat_date', startDate)
      .lte('stat_date', endDate)
      .order('stat_date');
    query = applyOwnerFilter(query, ownerIds);

    if (automationId) {
      query = query.eq('automation_id', automationId);
    } else {
      query = query.is('automation_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get stats comparison (current period vs previous)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getComparisonStats(ownerIds, days = 30) {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    const [currentStats, previousStats] = await Promise.all([
      this.getStats(ownerIds, currentStart.toISOString().split('T')[0], now.toISOString().split('T')[0]),
      this.getStats(ownerIds, previousStart.toISOString().split('T')[0], currentStart.toISOString().split('T')[0])
    ]);

    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous * 100).toFixed(1);
    };

    return {
      current: currentStats,
      previous: previousStats,
      changes: {
        sent: calculateChange(currentStats.total_sent, previousStats.total_sent),
        delivered: calculateChange(currentStats.total_delivered, previousStats.total_delivered),
        opened: calculateChange(currentStats.unique_opens, previousStats.unique_opens),
        clicked: calculateChange(currentStats.unique_clicks, previousStats.unique_clicks),
        bounced: calculateChange(currentStats.total_bounced, previousStats.total_bounced)
      }
    };
  }
};

export const emailEventsService = {
  /**
   * Get events for an email log
   */
  async getByEmailLog(emailLogId) {
    const { data, error } = await supabase
      .from('email_events')
      .select('*')
      .eq('email_log_id', emailLogId)
      .order('event_timestamp', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  /**
   * Create a new event
   */
  async create(event) {
    const { data, error } = await supabase
      .from('email_events')
      .insert(event)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Create multiple events (batch)
   */
  async createBatch(events) {
    const { data, error } = await supabase
      .from('email_events')
      .insert(events)
      .select();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get events by SendGrid message ID
   */
  async getBySendgridMessageId(messageId) {
    const { data, error } = await supabase
      .from('email_events')
      .select('*')
      .eq('sendgrid_message_id', messageId)
      .order('event_timestamp');
    
    if (error) throw error;
    return data;
  }
};

export default emailLogsService;
