// src/services/activityLog.js
import { supabase } from '../lib/supabase';

export const activityLogService = {
  /**
   * Get recent activity for a user
   */
  async getRecent(ownerId, options = {}) {
    const { category, limit = 20, offset = 0 } = options;
    
    let query = supabase
      .from('activity_log')
      .select(`
        *,
        account:accounts(account_unique_id, name),
        automation:automations(id, name),
        email_log:email_logs(id, subject)
      `)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (category) {
      query = query.eq('event_category', category);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get activity for a specific account
   */
  async getByAccount(ownerId, accountId, limit = 20) {
    const { data, error } = await supabase
      .from('activity_log')
      .select(`
        *,
        automation:automations(id, name),
        email_log:email_logs(id, subject)
      `)
      .eq('owner_id', ownerId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get activity for a specific automation
   */
  async getByAutomation(ownerId, automationId, limit = 50) {
    const { data, error } = await supabase
      .from('activity_log')
      .select(`
        *,
        account:accounts(account_unique_id, name)
      `)
      .eq('owner_id', ownerId)
      .eq('automation_id', automationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get activity by event type
   */
  async getByType(ownerId, eventType, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const { data, error } = await supabase
      .from('activity_log')
      .select(`
        *,
        account:accounts(account_unique_id, name)
      `)
      .eq('owner_id', ownerId)
      .eq('event_type', eventType)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data;
  },

  /**
   * Log an activity
   */
  async log(ownerId, activity) {
    const { data, error } = await supabase
      .from('activity_log')
      .insert({
        owner_id: ownerId,
        ...activity
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Log email sent
   */
  async logEmailSent(ownerId, emailLogId, accountId, automationId = null) {
    return this.log(ownerId, {
      event_type: 'email_sent',
      event_category: 'email',
      title: 'Email sent',
      email_log_id: emailLogId,
      account_id: accountId,
      automation_id: automationId,
      actor_type: automationId ? 'automation' : 'user'
    });
  },

  /**
   * Log email opened
   */
  async logEmailOpened(ownerId, emailLogId, accountId) {
    return this.log(ownerId, {
      event_type: 'email_opened',
      event_category: 'email',
      title: 'Email opened',
      email_log_id: emailLogId,
      account_id: accountId,
      actor_type: 'system'
    });
  },

  /**
   * Log email clicked
   */
  async logEmailClicked(ownerId, emailLogId, accountId, url = null) {
    return this.log(ownerId, {
      event_type: 'email_clicked',
      event_category: 'email',
      title: 'Email link clicked',
      email_log_id: emailLogId,
      account_id: accountId,
      actor_type: 'system',
      event_data: url ? { url } : {}
    });
  },

  /**
   * Log automation enrollment
   */
  async logEnrollment(ownerId, automationId, accountId, automationName) {
    return this.log(ownerId, {
      event_type: 'enrollment_created',
      event_category: 'automation',
      title: `Enrolled in ${automationName}`,
      automation_id: automationId,
      account_id: accountId,
      actor_type: 'automation'
    });
  },

  /**
   * Log automation completion
   */
  async logAutomationCompleted(ownerId, automationId, accountId, automationName) {
    return this.log(ownerId, {
      event_type: 'automation_completed',
      event_category: 'automation',
      title: `Completed ${automationName}`,
      automation_id: automationId,
      account_id: accountId,
      actor_type: 'automation'
    });
  },

  /**
   * Log unsubscribe
   */
  async logUnsubscribe(ownerId, accountId, type, automationId = null) {
    return this.log(ownerId, {
      event_type: 'unsubscribed',
      event_category: 'account',
      title: type === 'all' ? 'Unsubscribed from all emails' : 'Unsubscribed from automation',
      account_id: accountId,
      automation_id: automationId,
      actor_type: 'system',
      severity: 'warning'
    });
  },

  /**
   * Log bounce
   */
  async logBounce(ownerId, emailLogId, accountId, bounceType) {
    return this.log(ownerId, {
      event_type: 'email_bounced',
      event_category: 'email',
      title: `Email bounced (${bounceType})`,
      email_log_id: emailLogId,
      account_id: accountId,
      actor_type: 'system',
      severity: 'warning',
      event_data: { bounce_type: bounceType }
    });
  },

  /**
   * Get activity stats
   */
  async getStats(ownerId, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('activity_log')
      .select('event_type, event_category')
      .eq('owner_id', ownerId)
      .gte('created_at', startDate.toISOString());
    
    if (error) throw error;

    const stats = {
      total: data.length,
      byType: {},
      byCategory: {}
    };

    data.forEach(a => {
      stats.byType[a.event_type] = (stats.byType[a.event_type] || 0) + 1;
      stats.byCategory[a.event_category] = (stats.byCategory[a.event_category] || 0) + 1;
    });

    return stats;
  }
};

export default activityLogService;
