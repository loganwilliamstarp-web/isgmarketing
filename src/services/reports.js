// src/services/reports.js
// Reports Service - Aggregates data for the reporting dashboard

import { supabase } from '../lib/supabase';
import { applyOwnerFilter } from './utils/ownerFilter';
import { emailLogsService } from './emailLogs';
import { npsService } from './nps';

export const reportsService = {
  /**
   * Get comprehensive report data for dashboard
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {Object} options - { days, startDate, endDate }
   */
  async getDashboardReport(ownerIds, options = {}) {
    const { days = 30 } = options;

    // Parallel fetch all metrics
    const [
      emailPerformance,
      npsData,
      npsTrend,
      surveyStats,
      comparisonStats
    ] = await Promise.all([
      this.getEmailPerformanceReport(ownerIds, { days }),
      npsService.getCurrentNPS(ownerIds),
      npsService.getNPSTrend(ownerIds, days),
      npsService.getSurveyResponseRate(ownerIds, days),
      emailLogsService.getComparisonStats(ownerIds, days)
    ]);

    return {
      emailPerformance,
      npsData,
      npsTrend,
      surveyStats,
      emailComparison: comparisonStats
    };
  },

  /**
   * Get email performance time-series data
   * Queries directly from email_logs table and aggregates by date
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {Object} options - { days, aggregation: 'daily'|'weekly' }
   */
  async getEmailPerformanceReport(ownerIds, options = {}) {
    const { days = 30, aggregation = 'daily' } = options;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log('[Reports] getEmailPerformanceReport called with:', { ownerIds, days, startDate: startDate.toISOString() });

    // Use RPC function for efficient multi-owner queries
    const ownerArray = Array.isArray(ownerIds) ? ownerIds : [ownerIds];

    const { data, error } = await supabase.rpc('get_email_performance', {
      p_owner_ids: ownerArray,
      p_start_date: startDate.toISOString()
    });

    console.log('[Reports] email_logs query result:', { rowCount: data?.length, error: error ? JSON.stringify(error) : null });

    if (error) {
      console.error('[Reports] Full error:', error);
      throw error;
    }

    // Aggregate by date
    const dailyStats = {};

    (data || []).forEach(log => {
      const date = log.sent_at?.split('T')[0];
      if (!date) return;

      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          sent: 0,
          delivered: 0,
          opens: 0,
          clicks: 0,
          bounces: 0,
          replies: 0
        };
      }

      dailyStats[date].sent++;
      if (log.delivered_at) dailyStats[date].delivered++;
      if (log.first_opened_at) dailyStats[date].opens++;
      if (log.first_clicked_at) dailyStats[date].clicks++;
      if (log.bounced_at) dailyStats[date].bounces++;
      if (log.first_replied_at) dailyStats[date].replies++;
    });

    // Convert to sorted array
    const timeSeries = Object.values(dailyStats)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        open_rate: d.delivered > 0 ? Math.round((d.opens / d.delivered) * 10000) / 100 : 0,
        click_rate: d.delivered > 0 ? Math.round((d.clicks / d.delivered) * 10000) / 100 : 0
      }));

    // If weekly aggregation requested, group by week
    if (aggregation === 'weekly') {
      return this._aggregateWeekly(timeSeries);
    }

    // Calculate totals
    const totals = timeSeries.reduce((acc, d) => ({
      sent: acc.sent + d.sent,
      delivered: acc.delivered + d.delivered,
      opens: acc.opens + d.opens,
      clicks: acc.clicks + d.clicks,
      bounces: acc.bounces + d.bounces,
      replies: acc.replies + d.replies
    }), { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, replies: 0 });

    // Calculate rates
    const openRate = totals.delivered > 0 ? (totals.opens / totals.delivered) * 100 : 0;
    const clickRate = totals.delivered > 0 ? (totals.clicks / totals.delivered) * 100 : 0;
    const replyRate = totals.delivered > 0 ? (totals.replies / totals.delivered) * 100 : 0;

    return {
      timeSeries,
      totals: {
        ...totals,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        replyRate: Math.round(replyRate * 100) / 100
      }
    };
  },

  /**
   * Aggregate daily data into weekly buckets
   * @private
   */
  _aggregateWeekly(dailyData) {
    const weeks = {};

    dailyData.forEach(d => {
      const date = new Date(d.date);
      // Get start of week (Monday)
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1));
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          date: weekKey,
          sent: 0,
          delivered: 0,
          opens: 0,
          clicks: 0,
          bounces: 0,
          replies: 0
        };
      }

      weeks[weekKey].sent += d.sent;
      weeks[weekKey].delivered += d.delivered;
      weeks[weekKey].opens += d.opens;
      weeks[weekKey].clicks += d.clicks;
      weeks[weekKey].bounces += d.bounces;
      weeks[weekKey].replies += d.replies;
    });

    // Calculate rates for each week
    const timeSeries = Object.values(weeks).map(w => ({
      ...w,
      open_rate: w.delivered > 0 ? Math.round((w.opens / w.delivered) * 10000) / 100 : 0,
      click_rate: w.delivered > 0 ? Math.round((w.clicks / w.delivered) * 10000) / 100 : 0
    }));

    // Sort by date
    timeSeries.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate totals
    const totals = timeSeries.reduce((acc, w) => ({
      sent: acc.sent + w.sent,
      delivered: acc.delivered + w.delivered,
      opens: acc.opens + w.opens,
      clicks: acc.clicks + w.clicks,
      bounces: acc.bounces + w.bounces,
      replies: acc.replies + w.replies
    }), { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, replies: 0 });

    const openRate = totals.delivered > 0 ? (totals.opens / totals.delivered) * 100 : 0;
    const clickRate = totals.delivered > 0 ? (totals.clicks / totals.delivered) * 100 : 0;
    const replyRate = totals.delivered > 0 ? (totals.replies / totals.delivered) * 100 : 0;

    return {
      timeSeries,
      totals: {
        ...totals,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
        replyRate: Math.round(replyRate * 100) / 100
      }
    };
  },

  /**
   * Export report data as CSV
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {string} reportType - 'email'|'nps'|'all'
   * @param {Object} options - { days }
   */
  async exportReportCSV(ownerIds, reportType = 'all', options = {}) {
    const { days = 30 } = options;

    let csvContent = '';
    let filename = '';

    if (reportType === 'email' || reportType === 'all') {
      const emailData = await this.getEmailPerformanceReport(ownerIds, { days });

      csvContent += 'Email Performance Report\n';
      csvContent += `Period: Last ${days} days\n`;
      csvContent += `Generated: ${new Date().toISOString()}\n\n`;

      csvContent += 'Date,Sent,Delivered,Opens,Clicks,Bounces,Replies,Open Rate,Click Rate\n';
      emailData.timeSeries.forEach(row => {
        csvContent += `${row.date},${row.sent},${row.delivered},${row.opens},${row.clicks},${row.bounces},${row.replies},${row.open_rate}%,${row.click_rate}%\n`;
      });

      csvContent += '\nTotals\n';
      csvContent += `Total Sent,${emailData.totals.sent}\n`;
      csvContent += `Total Delivered,${emailData.totals.delivered}\n`;
      csvContent += `Total Opens,${emailData.totals.opens}\n`;
      csvContent += `Total Clicks,${emailData.totals.clicks}\n`;
      csvContent += `Open Rate,${emailData.totals.openRate}%\n`;
      csvContent += `Click Rate,${emailData.totals.clickRate}%\n`;

      filename = `email-report-${new Date().toISOString().split('T')[0]}.csv`;
    }

    if (reportType === 'nps' || reportType === 'all') {
      if (csvContent) csvContent += '\n\n';

      const npsData = await npsService.getCurrentNPS(ownerIds);
      const npsTrend = await npsService.getNPSTrend(ownerIds, days);

      csvContent += 'NPS Report\n';
      csvContent += `Period: Last ${days} days\n`;
      csvContent += `Generated: ${new Date().toISOString()}\n\n`;

      csvContent += 'Overall NPS Metrics\n';
      csvContent += `NPS Score,${npsData.nps_score}\n`;
      csvContent += `Total Responses,${npsData.total_responses}\n`;
      csvContent += `Promoters (4-5 stars),${npsData.promoters}\n`;
      csvContent += `Passives (3 stars),${npsData.passives}\n`;
      csvContent += `Detractors (1-2 stars),${npsData.detractors}\n`;
      csvContent += `Average Rating,${npsData.avg_rating}\n`;
      csvContent += `Feedback Count,${npsData.feedback_count}\n\n`;

      csvContent += 'Daily NPS Trend\n';
      csvContent += 'Date,NPS Score,Responses,Promoters,Passives,Detractors,Avg Rating\n';
      npsTrend.forEach(row => {
        csvContent += `${row.stat_date},${row.nps_score},${row.total_responses},${row.promoters},${row.passives},${row.detractors},${row.avg_rating}\n`;
      });

      filename = reportType === 'nps'
        ? `nps-report-${new Date().toISOString().split('T')[0]}.csv`
        : `full-report-${new Date().toISOString().split('T')[0]}.csv`;
    }

    if (reportType === 'pipeline' || reportType === 'all') {
      if (csvContent) csvContent += '\n\n';

      const pipelineData = await this.getPipelineReport(ownerIds, { days });

      csvContent += 'Pipeline & Conversion Report\n';
      csvContent += `Period: Last ${days} days\n`;
      csvContent += `Generated: ${new Date().toISOString()}\n\n`;

      csvContent += 'Account Status Breakdown\n';
      csvContent += `Customers,${pipelineData.statusCounts?.customer || 0}\n`;
      csvContent += `Prospects,${pipelineData.statusCounts?.prospect || 0}\n`;
      csvContent += `Leads,${pipelineData.statusCounts?.lead || 0}\n`;
      csvContent += `Prior Customers,${pipelineData.statusCounts?.prior_customer || 0}\n`;
      csvContent += `Total Accounts,${pipelineData.totalAccounts || 0}\n\n`;

      csvContent += 'Reply Metrics\n';
      csvContent += `Total Replies,${pipelineData.totalReplies || 0}\n`;
      csvContent += `Unique Accounts Replied,${pipelineData.uniqueAccountsReplied || 0}\n`;
      csvContent += `Change vs Previous Period,${pipelineData.replyChange || 0}%\n\n`;

      csvContent += 'Conversion Metrics\n';
      csvContent += `Email-Driven Sold,${pipelineData.totalSold || 0}\n`;
      csvContent += `Total Customers,${pipelineData.totalCustomers || 0}\n`;
      csvContent += `Quote Opportunities,${pipelineData.totalOpportunities || 0}\n`;
      csvContent += `Prior Customers (Win-Back),${pipelineData.totalPriorCustomers || 0}\n\n`;

      csvContent += 'Daily Reply Trend\n';
      csvContent += 'Date,Replies\n';
      (pipelineData.replyTimeSeries || []).forEach(row => {
        csvContent += `${row.date},${row.replies}\n`;
      });

      if (reportType === 'pipeline') {
        filename = `pipeline-report-${new Date().toISOString().split('T')[0]}.csv`;
      } else {
        filename = `full-report-${new Date().toISOString().split('T')[0]}.csv`;
      }
    }

    return {
      content: csvContent,
      filename,
      mimeType: 'text/csv'
    };
  },

  /**
   * Get cohort analysis data (accounts grouped by first email date)
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {Object} options - { cohortSize: 'week'|'month' }
   */
  async getCohortAnalysis(ownerIds, options = {}) {
    const { cohortSize = 'month' } = options;

    // Get accounts with their first email date
    let query = supabase
      .from('email_logs')
      .select(`
        account_id,
        sent_at,
        status,
        first_opened_at,
        first_clicked_at,
        accounts!inner(account_unique_id, name, survey_stars, survey_completed_at)
      `)
      .not('account_id', 'is', null)
      .order('sent_at', { ascending: true });

    query = applyOwnerFilter(query, ownerIds);

    const { data, error } = await query;

    if (error) throw error;

    // Group by first email date (cohort)
    const cohorts = {};
    const accountFirstEmail = {};

    (data || []).forEach(log => {
      const accountId = log.account_id;
      const sentDate = new Date(log.sent_at);

      // Track first email per account
      if (!accountFirstEmail[accountId] || sentDate < accountFirstEmail[accountId]) {
        accountFirstEmail[accountId] = sentDate;
      }
    });

    // Now group accounts into cohorts
    Object.entries(accountFirstEmail).forEach(([accountId, firstDate]) => {
      let cohortKey;
      if (cohortSize === 'week') {
        const weekStart = new Date(firstDate);
        weekStart.setDate(firstDate.getDate() - firstDate.getDay());
        cohortKey = weekStart.toISOString().split('T')[0];
      } else {
        cohortKey = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!cohorts[cohortKey]) {
        cohorts[cohortKey] = {
          period: cohortKey,
          accounts: 0,
          engaged: 0,
          surveyed: 0,
          promoters: 0
        };
      }

      cohorts[cohortKey].accounts++;

      // Find this account's engagement
      const accountLogs = (data || []).filter(l => l.account_id === accountId);
      const hasOpened = accountLogs.some(l => l.first_opened_at);
      const account = accountLogs[0]?.accounts;

      if (hasOpened) cohorts[cohortKey].engaged++;
      if (account?.survey_completed_at) cohorts[cohortKey].surveyed++;
      if (account?.survey_stars >= 4) cohorts[cohortKey].promoters++;
    });

    // Convert to array and calculate rates
    const result = Object.values(cohorts)
      .map(c => ({
        ...c,
        engagementRate: c.accounts > 0 ? Math.round((c.engaged / c.accounts) * 100) : 0,
        surveyRate: c.accounts > 0 ? Math.round((c.surveyed / c.accounts) * 100) : 0,
        promoterRate: c.surveyed > 0 ? Math.round((c.promoters / c.surveyed) * 100) : 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return result;
  },

  /**
   * Get pipeline/conversion metrics for the user's accounts
   * Includes: account status breakdown, reply analytics, sold accounts, quote opportunities
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {Object} options - { days }
   */
  async getPipelineReport(ownerIds, options = {}) {
    const { days = 30 } = options;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prevStartDate = new Date();
    prevStartDate.setDate(prevStartDate.getDate() - days * 2);

    const ownerArray = Array.isArray(ownerIds) ? ownerIds : [ownerIds];

    // Parallel fetch all pipeline data
    const [
      accountsByStatus,
      repliedEmails,
      prevRepliedEmails,
      recentReplies,
      soldQuery,
      emailedAccountIds
    ] = await Promise.all([
      // Account status breakdown
      supabase
        .from('accounts')
        .select('account_status')
        .in('owner_id', ownerArray),

      // Replies this period
      (() => {
        let q = supabase
          .from('email_logs')
          .select(`
            first_replied_at,
            to_email,
            subject,
            account_id,
            account:accounts(name, account_status)
          `)
          .not('first_replied_at', 'is', null)
          .gte('first_replied_at', startDate.toISOString());
        return applyOwnerFilter(q, ownerIds);
      })(),

      // Replies previous period (for comparison)
      (() => {
        let q = supabase
          .from('email_logs')
          .select('first_replied_at')
          .not('first_replied_at', 'is', null)
          .gte('first_replied_at', prevStartDate.toISOString())
          .lt('first_replied_at', startDate.toISOString());
        return applyOwnerFilter(q, ownerIds);
      })(),

      // Recent replies with details
      (() => {
        let q = supabase
          .from('email_logs')
          .select(`
            first_replied_at,
            to_email,
            subject,
            account_id,
            account:accounts(name, account_status)
          `)
          .not('first_replied_at', 'is', null)
          .order('first_replied_at', { ascending: false })
          .limit(15);
        return applyOwnerFilter(q, ownerIds);
      })(),

      // Customer accounts (potential sold)
      supabase
        .from('accounts')
        .select('account_unique_id, name, person_email, account_status, created_at')
        .in('owner_id', ownerArray)
        .ilike('account_status', 'customer'),

      // All email_logs account_ids for this user (to find email-driven conversions)
      (() => {
        let q = supabase
          .from('email_logs')
          .select('account_id')
          .not('account_id', 'is', null);
        return applyOwnerFilter(q, ownerIds);
      })()
    ]);

    // Account status breakdown
    const statusCounts = { customer: 0, prospect: 0, prior_customer: 0, lead: 0, other: 0 };
    (accountsByStatus.data || []).forEach(a => {
      const status = (a.account_status || '').toLowerCase();
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      } else {
        statusCounts.other++;
      }
    });
    const totalAccounts = (accountsByStatus.data || []).length;

    // Reply analytics
    const replies = repliedEmails.data || [];
    const totalReplies = replies.length;
    const prevReplyCount = prevRepliedEmails.data?.length || 0;
    const replyChange = prevReplyCount > 0
      ? Math.round(((totalReplies - prevReplyCount) / prevReplyCount) * 100)
      : 0;

    // Unique accounts that replied
    const repliedAccountIds = new Set();
    replies.forEach(r => { if (r.account_id) repliedAccountIds.add(r.account_id); });

    // Recent replies list
    const recentReplyList = (recentReplies.data || []).map(r => ({
      accountName: r.account?.name || r.to_email,
      accountStatus: r.account?.account_status || 'Unknown',
      subject: r.subject,
      repliedAt: r.first_replied_at
    }));

    // Sold accounts (customers that received emails)
    const emailedIds = new Set((emailedAccountIds.data || []).map(e => e.account_id));
    const customerData = soldQuery.data || [];
    const soldAccounts = customerData.filter(c => emailedIds.has(c.account_unique_id));

    const recentSold = soldAccounts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(c => ({
        name: c.name,
        email: c.person_email,
        createdAt: c.created_at
      }));

    // Replies by day for chart
    const dailyReplies = {};
    replies.forEach(r => {
      const date = r.first_replied_at?.split('T')[0];
      if (date) dailyReplies[date] = (dailyReplies[date] || 0) + 1;
    });

    // Fill in missing dates
    const replyTimeSeries = [];
    const current = new Date(startDate);
    const now = new Date();
    while (current <= now) {
      const dateStr = current.toISOString().split('T')[0];
      replyTimeSeries.push({ date: dateStr, replies: dailyReplies[dateStr] || 0 });
      current.setDate(current.getDate() + 1);
    }

    return {
      // Account breakdown
      statusCounts,
      totalAccounts,

      // Reply metrics
      totalReplies,
      replyChange,
      uniqueAccountsReplied: repliedAccountIds.size,
      recentReplies: recentReplyList,
      replyTimeSeries,

      // Sold metrics
      totalCustomers: customerData.length,
      totalSold: soldAccounts.length,
      recentSold,

      // Quote opportunities
      totalProspects: statusCounts.prospect,
      totalLeads: statusCounts.lead,
      totalOpportunities: statusCounts.prospect + statusCounts.lead,

      // Prior customers (win-back)
      totalPriorCustomers: statusCounts.prior_customer
    };
  }
};

export default reportsService;
