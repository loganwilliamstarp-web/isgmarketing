// src/services/dashboard.js
import { supabase } from '../lib/supabase';
import { emailLogsService } from './emailLogs';
import { activityLogService } from './activityLog';
import { scheduledEmailsService } from './scheduledEmails';
import { accountsService } from './accounts';

export const dashboardService = {
  /**
   * Get all dashboard data in one call
   */
  async getDashboardData(ownerId, options = {}) {
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
      emailLogsService.getComparisonStats(ownerId, days),
      activityLogService.getRecent(ownerId, { limit: 10 }),
      scheduledEmailsService.getUpcoming(ownerId, 5),
      emailLogsService.getRecentOpens(ownerId, 5),
      emailLogsService.getRecentClicks(ownerId, 5),
      accountsService.getCounts(ownerId),
      this.getAutomationStats(ownerId)
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
   */
  async getAutomationStats(ownerId) {
    const { data: automations, error } = await supabase
      .from('automations')
      .select(`
        id,
        name,
        status,
        stats
      `)
      .eq('owner_id', ownerId)
      .eq('status', 'Active');
    
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
   */
  async getEmailPerformanceOverTime(ownerId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from('email_stats_daily')
      .select('*')
      .eq('owner_id', ownerId)
      .is('automation_id', null)
      .gte('stat_date', startDate.toISOString().split('T')[0])
      .order('stat_date');
    
    if (error) throw error;
    
    return data;
  },

  /**
   * Get top performing automations
   */
  async getTopAutomations(ownerId, limit = 5) {
    const { data: automations, error } = await supabase
      .from('automations')
      .select('id, name, stats')
      .eq('owner_id', ownerId)
      .eq('status', 'Active');
    
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
   */
  async getAccountsNeedingAttention(ownerId) {
    // Get accounts with bounced emails
    const { data: bouncedAccounts, error: bounceError } = await supabase
      .from('email_logs')
      .select(`
        account:accounts(account_unique_id, name, person_email)
      `)
      .eq('owner_id', ownerId)
      .eq('status', 'Bounced')
      .not('account_id', 'is', null)
      .limit(10);
    
    if (bounceError) throw bounceError;

    // Get expiring policies (next 30 days)
    const expiringPolicies = await accountsService.getWithExpiringPolicies(ownerId, 30);

    return {
      bouncedEmails: bouncedAccounts
        .map(b => b.account)
        .filter((v, i, a) => a.findIndex(t => t.account_unique_id === v.account_unique_id) === i),
      expiringPolicies: expiringPolicies.slice(0, 10)
    };
  },

  /**
   * Get quick stats (lightweight version for header/sidebar)
   */
  async getQuickStats(ownerId) {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Parallel queries for speed
    const [
      { count: emailsToday },
      { count: opensToday },
      { count: activeAutomations },
      { count: pendingScheduled }
    ] = await Promise.all([
      supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .gte('sent_at', today),
      
      supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .gte('first_opened_at', today),
      
      supabase
        .from('automations')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('status', 'Active'),
      
      supabase
        .from('scheduled_emails')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('status', 'Pending')
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
