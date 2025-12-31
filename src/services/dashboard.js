// src/services/dashboard.js
import { supabase } from '../lib/supabase';
import { emailLogsService } from './emailLogs';
import { activityLogService } from './activityLog';
import { scheduledEmailsService } from './scheduledEmails';
import { accountsService } from './accounts';
import { applyOwnerFilter } from './utils/ownerFilter';

export const dashboardService = {
  /**
   * Get all dashboard data in one call
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getDashboardData(ownerIds, options = {}) {
    const { days = 30 } = options;

    const [
      stats,
      recentActivity,
      scheduledEmails,
      recentOpens,
      recentClicks,
      accountCounts,
      automationStats
    ] = await Promise.all([
      emailLogsService.getComparisonStats(ownerIds, days),
      activityLogService.getRecent(ownerIds, { limit: 10 }),
      scheduledEmailsService.getUpcoming(ownerIds, 5),
      emailLogsService.getRecentOpens(ownerIds, 5),
      emailLogsService.getRecentClicks(ownerIds, 5),
      accountsService.getCounts(ownerIds),
      this.getAutomationStats(ownerIds)
    ]);

    return {
      emailStats: stats.current,
      emailChanges: stats.changes,
      recentActivity,
      scheduledEmails,
      recentOpens,
      recentClicks,
      accountCounts,
      automationStats
    };
  },

  /**
   * Get automation stats summary
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAutomationStats(ownerIds) {
    let query = supabase
      .from('automations')
      .select(`
        id,
        name,
        status,
        stats
      `)
      .eq('status', 'Active');
    query = applyOwnerFilter(query, ownerIds);
    const { data: automations, error } = await query;
    
    if (error) throw error;

    // Get enrollment counts
    const automationIds = automations.map(a => a.id);
    
    const { data: enrollments, error: enrollError } = await supabase
      .from('automation_enrollments')
      .select('automation_id, status')
      .in('automation_id', automationIds);
    
    if (enrollError) throw enrollError;

    // Build stats per automation
    const enrollmentCounts = {};
    enrollments.forEach(e => {
      if (!enrollmentCounts[e.automation_id]) {
        enrollmentCounts[e.automation_id] = { active: 0, total: 0 };
      }
      enrollmentCounts[e.automation_id].total++;
      if (e.status === 'Active') {
        enrollmentCounts[e.automation_id].active++;
      }
    });

    return {
      total: automations.length,
      active: automations.filter(a => a.status === 'Active').length,
      automations: automations.map(a => ({
        ...a,
        enrollmentCount: enrollmentCounts[a.id]?.total || 0,
        activeEnrollments: enrollmentCounts[a.id]?.active || 0
      }))
    };
  },

  /**
   * Get email performance over time (for charts)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getEmailPerformanceOverTime(ownerIds, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = supabase
      .from('email_stats_daily')
      .select('*')
      .is('automation_id', null)
      .gte('stat_date', startDate.toISOString().split('T')[0])
      .order('stat_date');
    query = applyOwnerFilter(query, ownerIds);

    const { data, error } = await query;
    if (error) throw error;

    return data;
  },

  /**
   * Get top performing automations
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getTopAutomations(ownerIds, limit = 5) {
    let query = supabase
      .from('automations')
      .select('id, name, stats')
      .eq('status', 'Active');
    query = applyOwnerFilter(query, ownerIds);

    const { data: automations, error } = await query;
    if (error) throw error;

    // Sort by open rate from stats
    const sorted = automations
      .map(a => ({
        ...a,
        sent: a.stats?.sent || 0,
        opened: a.stats?.opened || 0,
        clicked: a.stats?.clicked || 0,
        openRate: a.stats?.sent > 0 ? ((a.stats?.opened || 0) / a.stats.sent * 100) : 0
      }))
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, limit);

    return sorted;
  },

  /**
   * Get accounts needing attention
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAccountsNeedingAttention(ownerIds) {
    // Get accounts with bounced emails
    let bouncedQuery = supabase
      .from('email_logs')
      .select(`
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('status', 'Bounced')
      .not('account_id', 'is', null)
      .limit(10);
    bouncedQuery = applyOwnerFilter(bouncedQuery, ownerIds);

    const { data: bouncedAccounts, error: bounceError } = await bouncedQuery;
    if (bounceError) throw bounceError;

    // Get expiring policies (next 30 days)
    const expiringPolicies = await accountsService.getWithExpiringPolicies(ownerIds, 30);

    return {
      bouncedEmails: bouncedAccounts
        .map(b => b.account)
        .filter((v, i, a) => a.findIndex(t => t.account_unique_id === v.account_unique_id) === i),
      expiringPolicies: expiringPolicies.slice(0, 10)
    };
  },

  /**
   * Get quick stats (lightweight version for header/sidebar)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getQuickStats(ownerIds) {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Build queries with owner filter
    let emailsTodayQuery = supabase.from('email_logs').select('*', { count: 'exact', head: true }).gte('sent_at', today);
    emailsTodayQuery = applyOwnerFilter(emailsTodayQuery, ownerIds);

    let opensTodayQuery = supabase.from('email_logs').select('*', { count: 'exact', head: true }).gte('first_opened_at', today);
    opensTodayQuery = applyOwnerFilter(opensTodayQuery, ownerIds);

    let activeAutomationsQuery = supabase.from('automations').select('*', { count: 'exact', head: true }).eq('status', 'Active');
    activeAutomationsQuery = applyOwnerFilter(activeAutomationsQuery, ownerIds);

    let pendingScheduledQuery = supabase.from('scheduled_emails').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    pendingScheduledQuery = applyOwnerFilter(pendingScheduledQuery, ownerIds);

    // Parallel queries for speed
    const [
      { count: emailsToday },
      { count: opensToday },
      { count: activeAutomations },
      { count: pendingScheduled }
    ] = await Promise.all([
      emailsTodayQuery,
      opensTodayQuery,
      activeAutomationsQuery,
      pendingScheduledQuery
    ]);

    return {
      emailsToday: emailsToday || 0,
      opensToday: opensToday || 0,
      activeAutomations: activeAutomations || 0,
      pendingScheduled: pendingScheduled || 0
    };
  }
};

export default dashboardService;
