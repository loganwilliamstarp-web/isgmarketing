// src/services/emailLogs.js
import { supabase } from '../lib/supabase';

export const emailLogsService = {
  /**
   * Get all email logs for a user
   */
  async getAll(ownerId, options = {}) {
    const { status, automationId, accountId, limit = 50, offset = 0, startDate, endDate } = options;
    
    let query = supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email, primary_contact_first_name),
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
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
   */
  async getById(ownerId, emailLogId) {
    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(*),
        template:email_templates(*),
        automation:automations(id, name),
        enrollment:automation_enrollments(id, status)
      `)
      .eq('owner_id', ownerId)
      .eq('id', emailLogId)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get email log with all events
   */
  async getByIdWithEvents(ownerId, emailLogId) {
    const emailLog = await this.getById(ownerId, emailLogId);
    
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
   */
  async getByAccount(ownerId, accountId, options = {}) {
    const { limit = 20 } = options;
    
    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        *,
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .eq('owner_id', ownerId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get emails for a specific automation
   */
  async getByAutomation(ownerId, automationId, options = {}) {
    const { limit = 50, offset = 0, status } = options;
    
    let query = supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('owner_id', ownerId)
      .eq('automation_id', automationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Create a new email log
   */
  async create(ownerId, emailLog) {
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
   */
  async updateStatus(ownerId, emailLogId, status, additionalData = {}) {
    const { data, error } = await supabase
      .from('email_logs')
      .update({
        status,
        ...additionalData,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('id', emailLogId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Mark as sent
   */
  async markSent(ownerId, emailLogId, sendgridMessageId) {
    return this.updateStatus(ownerId, emailLogId, 'Sent', {
      sent_at: new Date().toISOString(),
      sendgrid_message_id: sendgridMessageId
    });
  },

  /**
   * Mark as failed
   */
  async markFailed(ownerId, emailLogId, errorMessage, errorCode = null) {
    return this.updateStatus(ownerId, emailLogId, 'Failed', {
      failed_at: new Date().toISOString(),
      error_message: errorMessage,
      error_code: errorCode
    });
  },

  /**
   * Get recent opens
   */
  async getRecentOpens(ownerId, limit = 10) {
    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        id, subject, first_opened_at, open_count,
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('owner_id', ownerId)
      .not('first_opened_at', 'is', null)
      .order('first_opened_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get recent clicks
   */
  async getRecentClicks(ownerId, limit = 10) {
    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        id, subject, first_clicked_at, click_count,
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('owner_id', ownerId)
      .not('first_clicked_at', 'is', null)
      .order('first_clicked_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get bounced emails
   */
  async getBounces(ownerId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('owner_id', ownerId)
      .eq('status', 'Bounced')
      .order('bounced_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get email stats for date range
   */
  async getStats(ownerId, startDate, endDate, automationId = null) {
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
   */
  async getDailyStats(ownerId, startDate, endDate, automationId = null) {
    let query = supabase
      .from('email_stats_daily')
      .select('*')
      .eq('owner_id', ownerId)
      .gte('stat_date', startDate)
      .lte('stat_date', endDate)
      .order('stat_date');
    
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
   */
  async getComparisonStats(ownerId, days = 30) {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);
    
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);
    
    const [currentStats, previousStats] = await Promise.all([
      this.getStats(ownerId, currentStart.toISOString().split('T')[0], now.toISOString().split('T')[0]),
      this.getStats(ownerId, previousStart.toISOString().split('T')[0], currentStart.toISOString().split('T')[0])
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
