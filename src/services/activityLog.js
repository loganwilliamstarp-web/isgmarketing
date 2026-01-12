// src/services/activityLog.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter, getFirstOwnerId } from './utils/ownerFilter';

export const activityLogService = {
  /**
   * Get recent activity for a user
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getRecent(ownerIds, options = {}) {
    const { category, limit = 20, offset = 0 } = options;

    let query = supabase
      .from('activity_log')
      .select(`
        *,
        account:accounts(account_unique_id, name),
        automation:automations(id, name),
        email_log:email_logs(id, subject)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);

    if (category) {
      query = query.eq('event_category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get activity for a specific account
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByAccount(ownerIds, accountId, limit = 20) {
    let query = supabase
      .from('activity_log')
      .select(`
        *,
        automation:automations(id, name),
        email_log:email_logs(id, subject)
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    console.log('Activity log query result:', { accountId, ownerIds, data, error });

    if (error) throw error;
    return data;
  },

  /**
   * Get activity for a specific automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByAutomation(ownerIds, automationId, limit = 50) {
    let query = supabase
      .from('activity_log')
      .select(`
        *,
        account:accounts(account_unique_id, name)
      `)
      .eq('automation_id', automationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Get activity by event type
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByType(ownerIds, eventType, options = {}) {
    const { limit = 50, offset = 0 } = options;

    let query = supabase
      .from('activity_log')
      .select(`
        *,
        account:accounts(account_unique_id, name)
      `)
      .eq('event_type', eventType)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;
    return data;
  },

  /**
   * Log an activity
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async log(ownerIds, activity) {
    const ownerId = getFirstOwnerId(ownerIds);
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logEmailSent(ownerIds, emailLogId, accountId, automationId = null) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logEmailOpened(ownerIds, emailLogId, accountId) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logEmailClicked(ownerIds, emailLogId, accountId, url = null) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logEnrollment(ownerIds, automationId, accountId, automationName) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logAutomationCompleted(ownerIds, automationId, accountId, automationName) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logUnsubscribe(ownerIds, accountId, type, automationId = null) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs (uses first for creation)
   */
  async logBounce(ownerIds, emailLogId, accountId, bounceType) {
    return this.log(ownerIds, {
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
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getStats(ownerIds, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = supabase
      .from('activity_log')
      .select('event_type, event_category')
      .gte('created_at', startDate.toISOString());
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

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
