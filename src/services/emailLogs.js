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
  },

  /**
   * Get response rate stats (emails with replies)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {Object} options - Query options
   */
  async getResponseRateStats(ownerIds, options = {}) {
    const { startDate, endDate, automationId } = options;
    const ownerId = getFirstOwnerId(ownerIds);

    // Use RPC function if available
    const { data, error } = await supabase
      .rpc('get_response_rate', {
        p_owner_id: ownerId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_automation_id: automationId || null
      });

    if (error) {
      // Fallback to manual calculation if RPC not available
      console.warn('RPC get_response_rate not available, using fallback:', error);
      return this.calculateResponseRateFallback(ownerIds, options);
    }

    return data?.[0] || {
      total_delivered: 0,
      total_replied: 0,
      response_rate: 0
    };
  },

  /**
   * Fallback response rate calculation when RPC is not available
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {Object} options - Query options
   */
  async calculateResponseRateFallback(ownerIds, options = {}) {
    const { startDate, endDate, automationId } = options;

    let query = supabase
      .from('email_logs')
      .select('id, delivered_at, first_replied_at', { count: 'exact' });

    query = applyOwnerFilter(query, ownerIds);

    if (startDate) {
      query = query.gte('sent_at', startDate);
    }
    if (endDate) {
      query = query.lte('sent_at', endDate);
    }
    if (automationId) {
      query = query.eq('automation_id', automationId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const emails = data || [];
    const totalDelivered = emails.filter(e => e.delivered_at).length;
    const totalReplied = emails.filter(e => e.first_replied_at).length;
    const responseRate = totalDelivered > 0
      ? Math.round((totalReplied / totalDelivered) * 10000) / 100
      : 0;

    return {
      total_delivered: totalDelivered,
      total_replied: totalReplied,
      response_rate: responseRate
    };
  },

  /**
   * Get recent replies
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {number} limit - Max number of replies to return
   */
  async getRecentReplies(ownerIds, limit = 10) {
    let query = supabase
      .from('email_logs')
      .select(`
        id, subject, first_replied_at, reply_count,
        account:accounts(account_unique_id, name, person_email)
      `)
      .not('first_replied_at', 'is', null)
      .order('first_replied_at', { ascending: false })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get email log with replies
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {number} emailLogId - Email log ID
   */
  async getByIdWithReplies(ownerIds, emailLogId) {
    const emailLog = await this.getById(ownerIds, emailLogId);

    const { data: replies, error } = await supabase
      .from('email_replies')
      .select('*')
      .eq('email_log_id', emailLogId)
      .order('received_at', { ascending: true });

    if (error) throw error;

    return {
      ...emailLog,
      replies: replies || []
    };
  }
};

// Email Replies Service
export const emailRepliesService = {
  /**
   * Get all replies for an owner
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {Object} options - Query options
   */
  async getAll(ownerIds, options = {}) {
    const { limit = 50, offset = 0, startDate, endDate, accountId } = options;

    let query = supabase
      .from('email_replies')
      .select(`
        *,
        email_log:email_logs(id, subject, to_email, automation_id),
        account:accounts(account_unique_id, name, person_email)
      `)
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1);

    query = applyOwnerFilter(query, ownerIds);

    if (startDate) {
      query = query.gte('received_at', startDate);
    }
    if (endDate) {
      query = query.lte('received_at', endDate);
    }
    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get a single reply by ID
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {number} replyId - Reply ID
   */
  async getById(ownerIds, replyId) {
    let query = supabase
      .from('email_replies')
      .select(`
        *,
        email_log:email_logs(*),
        account:accounts(*)
      `)
      .eq('id', replyId);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query.single();

    if (error) throw error;
    return data;
  },

  /**
   * Get replies for a specific email log
   * @param {number} emailLogId - Email log ID
   */
  async getByEmailLog(emailLogId) {
    const { data, error } = await supabase
      .from('email_replies')
      .select('*')
      .eq('email_log_id', emailLogId)
      .order('received_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Get reply count for an email log
   * @param {number} emailLogId - Email log ID
   */
  async getReplyCount(emailLogId) {
    const { count, error } = await supabase
      .from('email_replies')
      .select('id', { count: 'exact', head: true })
      .eq('email_log_id', emailLogId);

    if (error) throw error;
    return count || 0;
  }
};

/**
 * Combined email activity feed service
 * Pulls from email_logs, email_events, and email_replies
 */
export const emailActivityService = {
  /**
   * Get combined recent email activity feed
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   * @param {Object} options - Query options
   */
  async getRecentActivity(ownerIds, options = {}) {
    const { limit = 20 } = options;

    // Fetch from multiple sources in parallel
    const [recentSends, recentOpens, recentClicks, recentReplies] = await Promise.all([
      // Recent email sends
      (async () => {
        let query = supabase
          .from('email_logs')
          .select(`
            id, subject, to_email, to_name, status, sent_at, created_at,
            account:accounts(account_unique_id, name)
          `)
          .in('status', ['Sent', 'Delivered', 'Queued'])
          .order('created_at', { ascending: false })
          .limit(limit);
        query = applyOwnerFilter(query, ownerIds);
        const { data } = await query;
        return (data || []).map(e => ({
          id: `send-${e.id}`,
          type: 'sent',
          email_log_id: e.id,
          subject: e.subject,
          to_email: e.to_email,
          to_name: e.to_name,
          status: e.status,
          account: e.account,
          timestamp: e.sent_at || e.created_at
        }));
      })(),

      // Recent opens (from email_logs first_opened_at)
      (async () => {
        let query = supabase
          .from('email_logs')
          .select(`
            id, subject, to_email, to_name, first_opened_at, open_count,
            account:accounts(account_unique_id, name)
          `)
          .not('first_opened_at', 'is', null)
          .order('first_opened_at', { ascending: false })
          .limit(limit);
        query = applyOwnerFilter(query, ownerIds);
        const { data } = await query;
        return (data || []).map(e => ({
          id: `open-${e.id}`,
          type: 'opened',
          email_log_id: e.id,
          subject: e.subject,
          to_email: e.to_email,
          to_name: e.to_name,
          open_count: e.open_count,
          account: e.account,
          timestamp: e.first_opened_at
        }));
      })(),

      // Recent clicks (from email_logs first_clicked_at)
      (async () => {
        let query = supabase
          .from('email_logs')
          .select(`
            id, subject, to_email, to_name, first_clicked_at, click_count,
            account:accounts(account_unique_id, name)
          `)
          .not('first_clicked_at', 'is', null)
          .order('first_clicked_at', { ascending: false })
          .limit(limit);
        query = applyOwnerFilter(query, ownerIds);
        const { data } = await query;
        return (data || []).map(e => ({
          id: `click-${e.id}`,
          type: 'clicked',
          email_log_id: e.id,
          subject: e.subject,
          to_email: e.to_email,
          to_name: e.to_name,
          click_count: e.click_count,
          account: e.account,
          timestamp: e.first_clicked_at
        }));
      })(),

      // Recent replies
      (async () => {
        let query = supabase
          .from('email_replies')
          .select(`
            id, subject, from_email, received_at, snippet,
            email_log:email_logs(id, subject, to_email),
            account:accounts(account_unique_id, name)
          `)
          .order('received_at', { ascending: false })
          .limit(limit);
        query = applyOwnerFilter(query, ownerIds);
        const { data } = await query;
        return (data || []).map(e => ({
          id: `reply-${e.id}`,
          type: 'replied',
          email_log_id: e.email_log?.id,
          subject: e.subject || e.email_log?.subject,
          from_email: e.from_email,
          snippet: e.snippet,
          account: e.account,
          timestamp: e.received_at
        }));
      })()
    ]);

    // Combine and sort by timestamp
    const allActivity = [...recentSends, ...recentOpens, ...recentClicks, ...recentReplies]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return allActivity;
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
