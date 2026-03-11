// src/services/masterAdminAnalytics.js
// Service for master admin platform-wide analytics

import { supabase } from '../lib/supabase';

export const masterAdminAnalyticsService = {
  /**
   * Get platform-wide overview stats
   */
  async getPlatformOverview() {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    // Execute queries in parallel
    const [
      totalUsers,
      agenciesData,
      activeAutomations,
      totalTemplates,
      yesterdayEmails,
      weekEmails,
      previousWeekEmails,
      monthEmails,
      sentToday,
      scheduledWeek,
      failedEmails24h,
      bouncesYesterday,
      todayEmails
    ] = await Promise.all([
      // Total users
      supabase
        .from('users')
        .select('user_unique_id', { count: 'exact', head: true }),

      // All agencies
      supabase
        .from('users')
        .select('profile_name')
        .not('profile_name', 'is', null),

      // Active automations
      supabase
        .from('automations')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Active', 'active']),

      // Total templates
      supabase
        .from('templates')
        .select('id', { count: 'exact', head: true }),

      // Yesterday's emails
      this.getEmailStats(yesterday.toISOString(), todayStart.toISOString()),

      // This week's emails
      this.getEmailStats(weekAgo.toISOString(), now.toISOString()),

      // Previous week's emails (for comparison)
      this.getEmailStats(twoWeeksAgo.toISOString(), weekAgo.toISOString()),

      // This month's emails
      this.getEmailStats(monthAgo.toISOString(), now.toISOString()),

      // Sent today
      supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', todayStart.toISOString()),

      // Scheduled for week
      supabase
        .from('scheduled_emails')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending')
        .gte('scheduled_for', todayStart.toISOString())
        .lt('scheduled_for', new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),

      // Today's email stats
      this.getEmailStats(todayStart.toISOString(), now.toISOString()),

      // Failed emails in last 24h
      supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Failed')
        .gte('created_at', yesterday.toISOString()),

      // Bounces yesterday
      supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Bounced')
        .gte('bounced_at', yesterday.toISOString())
    ]);

    // Calculate unique agencies
    const uniqueAgencies = new Set(agenciesData.data?.map(u => u.profile_name) || []);

    // Calculate week-over-week changes
    const sentChange = previousWeekEmails.sent > 0
      ? ((weekEmails.sent - previousWeekEmails.sent) / previousWeekEmails.sent * 100)
      : 0;

    const openRateChange = previousWeekEmails.openRate > 0
      ? (weekEmails.openRate - previousWeekEmails.openRate)
      : 0;

    const clickRateChange = previousWeekEmails.clickRate > 0
      ? (weekEmails.clickRate - previousWeekEmails.clickRate)
      : 0;

    return {
      // Platform stats
      totalUsers: totalUsers.count || 0,
      totalAgencies: uniqueAgencies.size,
      activeAutomations: activeAutomations.count || 0,
      totalTemplates: totalTemplates.count || 0,

      // Yesterday's metrics
      emailsSentYesterday: yesterdayEmails.sent,
      opensYesterday: yesterdayEmails.opened,
      clicksYesterday: yesterdayEmails.clicked,
      repliesYesterday: yesterdayEmails.replied,
      bouncesYesterday: bouncesYesterday.count || 0,

      // Weekly metrics
      emailsSentWeek: weekEmails.sent,
      openRateWeek: weekEmails.openRate,
      clickRateWeek: weekEmails.clickRate,
      responseRateWeek: weekEmails.responseRate,
      bounceRateWeek: weekEmails.bounceRate,

      // Monthly metrics
      emailsSentMonth: monthEmails.sent,

      // Week-over-week changes
      sentChange: Math.round(sentChange * 10) / 10,
      openRateChange: Math.round(openRateChange * 10) / 10,
      clickRateChange: Math.round(clickRateChange * 10) / 10,

      // Today's stats
      sentToday: sentToday.count || 0,
      scheduledWeek: scheduledWeek.count || 0,

      // Today's detailed metrics
      emailsSentToday: todayEmails.sent,
      opensToday: todayEmails.opened,
      clicksToday: todayEmails.clicked,
      repliesToday: todayEmails.replied,

      // System health
      failedEmails24h: failedEmails24h.count || 0
    };
  },

  /**
   * Get email stats for a date range
   */
  async getEmailStats(startDate, endDate) {
    const { data, error } = await supabase
      .from('email_logs')
      .select('status, delivered_at, first_opened_at, first_clicked_at, first_replied_at, bounced_at')
      .gte('sent_at', startDate)
      .lt('sent_at', endDate);

    if (error) {
      console.error('Error fetching email stats:', error);
      return { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, openRate: 0, clickRate: 0, bounceRate: 0, responseRate: 0 };
    }

    const emails = data || [];
    const sent = emails.length;
    const delivered = emails.filter(e => e.delivered_at).length;
    const opened = emails.filter(e => e.first_opened_at).length;
    const clicked = emails.filter(e => e.first_clicked_at).length;
    const replied = emails.filter(e => e.first_replied_at).length;
    const bounced = emails.filter(e => e.status === 'Bounced' || e.bounced_at).length;

    const openRate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0;
    const clickRate = delivered > 0 ? Math.round((clicked / delivered) * 1000) / 10 : 0;
    const bounceRate = sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0;
    const responseRate = delivered > 0 ? Math.round((replied / delivered) * 1000) / 10 : 0;

    return { sent, delivered, opened, clicked, replied, bounced, openRate, clickRate, bounceRate, responseRate };
  },

  /**
   * Get top agencies by email volume
   */
  async getTopAgencies(limit = 10) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: emails, error } = await supabase
      .from('email_logs')
      .select(`
        owner_id,
        status,
        delivered_at,
        first_opened_at,
        owner:users!inner(profile_name)
      `)
      .gte('sent_at', weekAgo.toISOString())
      .not('owner_id', 'is', null);

    if (error || !emails) {
      console.error('Error fetching agency stats:', error);
      return [];
    }

    // Group by agency
    const agencyStats = {};
    emails.forEach(email => {
      const agency = email.owner?.profile_name || 'Unknown';
      if (!agencyStats[agency]) {
        agencyStats[agency] = { sent: 0, delivered: 0, opened: 0 };
      }
      agencyStats[agency].sent++;
      if (email.delivered_at) agencyStats[agency].delivered++;
      if (email.first_opened_at) agencyStats[agency].opened++;
    });

    // Convert to array and sort
    return Object.entries(agencyStats)
      .map(([name, stats]) => ({
        name,
        sent: stats.sent,
        delivered: stats.delivered,
        opened: stats.opened,
        openRate: stats.delivered > 0 ? Math.round((stats.opened / stats.delivered) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, limit);
  },

  /**
   * Get top automations by performance (from email_logs)
   * Includes "sold" count: accounts emailed by this automation that are now customers
   */
  async getTopAutomations(limit = 10) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 30); // Look at last 30 days for better data

    // Get emails with automation info + account status
    const { data: emails, error } = await supabase
      .from('email_logs')
      .select(`
        automation_id,
        account_id,
        delivered_at,
        first_opened_at,
        first_clicked_at,
        first_replied_at,
        automation:automations!inner(id, name, status, owner_id),
        owner:users(first_name, last_name, profile_name),
        account:accounts(account_status)
      `)
      .not('automation_id', 'is', null)
      .gte('sent_at', weekAgo.toISOString());

    if (error || !emails) {
      console.error('Error fetching automation stats from email_logs:', error);
      return [];
    }

    // Group by automation
    const automationStats = {};
    emails.forEach(email => {
      const autoId = email.automation_id;
      if (!autoId || !email.automation) return;

      if (!automationStats[autoId]) {
        automationStats[autoId] = {
          id: autoId,
          name: email.automation?.name || 'Unknown',
          status: email.automation?.status,
          ownerName: email.owner?.profile_name ||
                     `${email.owner?.first_name || ''} ${email.owner?.last_name || ''}`.trim() ||
                     'Unknown',
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          replied: 0,
          soldAccountIds: new Set()
        };
      }
      automationStats[autoId].sent++;
      if (email.delivered_at) automationStats[autoId].delivered++;
      if (email.first_opened_at) automationStats[autoId].opened++;
      if (email.first_clicked_at) automationStats[autoId].clicked++;
      if (email.first_replied_at) automationStats[autoId].replied++;
      // Track sold: account was emailed by this automation and is now a customer
      if (email.account_id && email.account?.account_status?.toLowerCase() === 'customer') {
        automationStats[autoId].soldAccountIds.add(email.account_id);
      }
    });

    return Object.values(automationStats)
      .filter(a => a.sent > 0)
      .map(a => ({
        ...a,
        sold: a.soldAccountIds.size,
        soldAccountIds: undefined, // don't send the Set
        openRate: a.delivered > 0 ? Math.round((a.opened / a.delivered) * 1000) / 10 : 0,
        clickRate: a.delivered > 0 ? Math.round((a.clicked / a.delivered) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, limit);
  },

  /**
   * Get top users by email volume
   */
  async getTopUsers(limit = 10) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: emails, error } = await supabase
      .from('email_logs')
      .select(`
        owner_id,
        delivered_at,
        first_opened_at,
        owner:users!inner(first_name, last_name, email, profile_name)
      `)
      .gte('sent_at', weekAgo.toISOString())
      .not('owner_id', 'is', null);

    if (error || !emails) {
      console.error('Error fetching user stats:', error);
      return [];
    }

    // Group by user
    const userStats = {};
    emails.forEach(email => {
      const userId = email.owner_id;
      if (!userStats[userId]) {
        userStats[userId] = {
          name: `${email.owner?.first_name || ''} ${email.owner?.last_name || ''}`.trim() || email.owner?.email || 'Unknown',
          email: email.owner?.email,
          agency: email.owner?.profile_name,
          sent: 0,
          delivered: 0,
          opened: 0
        };
      }
      userStats[userId].sent++;
      if (email.delivered_at) userStats[userId].delivered++;
      if (email.first_opened_at) userStats[userId].opened++;
    });

    return Object.entries(userStats)
      .map(([userId, stats]) => ({
        userId,
        ...stats,
        openRate: stats.delivered > 0 ? Math.round((stats.opened / stats.delivered) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, limit);
  },

  /**
   * Get recent bounces
   */
  async getRecentBounces(limit = 10) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        to_email,
        error_message,
        bounced_at,
        account:accounts(name),
        owner:users(first_name, last_name, profile_name)
      `)
      .eq('status', 'Bounced')
      .gte('bounced_at', yesterday.toISOString())
      .order('bounced_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.error('Error fetching bounces:', error);
      return [];
    }

    return data.map(b => ({
      email: b.to_email,
      accountName: b.account?.name || 'Unknown',
      ownerName: `${b.owner?.first_name || ''} ${b.owner?.last_name || ''}`.trim() || 'Unknown',
      agency: b.owner?.profile_name,
      reason: b.error_message || 'Unknown reason',
      bouncedAt: b.bounced_at
    }));
  },

  /**
   * Get accounts with recent replies (last 7 days)
   */
  async getAccountsWithReplies(limit = 10) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data, error } = await supabase
      .from('email_logs')
      .select(`
        first_replied_at,
        to_email,
        account_id,
        account:accounts(id, name),
        owner:users(first_name, last_name, profile_name)
      `)
      .not('first_replied_at', 'is', null)
      .gte('first_replied_at', weekAgo.toISOString())
      .order('first_replied_at', { ascending: false });

    if (error || !data) {
      console.error('Error fetching replies:', error);
      return [];
    }

    // Group by account (or email if no account)
    const replyCounts = {};
    data.forEach(r => {
      const key = r.account?.id || r.to_email;
      if (key) {
        if (!replyCounts[key]) {
          replyCounts[key] = {
            name: r.account?.name || r.to_email || 'Unknown',
            agency: r.owner?.profile_name,
            count: 0,
            lastReply: r.first_replied_at
          };
        }
        replyCounts[key].count++;
      }
    });

    return Object.values(replyCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  /**
   * Get email volume time series for charts
   */
  async getEmailTimeSeries(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('email_logs')
      .select('sent_at, delivered_at, first_opened_at, first_clicked_at, first_replied_at, status')
      .gte('sent_at', startDate.toISOString())
      .order('sent_at', { ascending: true });

    if (error || !data) {
      console.error('Error fetching time series:', error);
      return [];
    }

    // Group by date
    const dailyStats = {};
    data.forEach(email => {
      const date = email.sent_at?.split('T')[0];
      if (!date) return;

      if (!dailyStats[date]) {
        dailyStats[date] = { date, sent: 0, delivered: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 };
      }
      dailyStats[date].sent++;
      if (email.delivered_at) dailyStats[date].delivered++;
      if (email.first_opened_at) dailyStats[date].opens++;
      if (email.first_clicked_at) dailyStats[date].clicks++;
      if (email.first_replied_at) dailyStats[date].replies++;
      if (email.status === 'Bounced') dailyStats[date].bounces++;
    });

    // Convert to array and fill missing dates
    const result = [];
    const currentDate = new Date(startDate);
    const endDate = new Date();

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      result.push(dailyStats[dateStr] || { date: dateStr, sent: 0, delivered: 0, opens: 0, clicks: 0, replies: 0, bounces: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  },

  /**
   * Get agency activity breakdown
   */
  async getAgencyBreakdown() {
    const { data: users, error } = await supabase
      .from('users')
      .select('user_unique_id, profile_name, marketing_cloud_engagement')
      .not('profile_name', 'is', null);

    if (error || !users) {
      console.error('Error fetching users:', error);
      return [];
    }

    // Group users by agency
    const agencyUsers = {};
    users.forEach(user => {
      const agency = user.profile_name;
      if (!agencyUsers[agency]) {
        agencyUsers[agency] = { total: 0, active: 0 };
      }
      agencyUsers[agency].total++;
      if (user.marketing_cloud_engagement) {
        agencyUsers[agency].active++;
      }
    });

    // Get automation counts per agency
    const { data: automations } = await supabase
      .from('automations')
      .select(`
        status,
        owner:users!inner(profile_name)
      `);

    const agencyAutomations = {};
    (automations || []).forEach(auto => {
      const agency = auto.owner?.profile_name;
      if (agency) {
        if (!agencyAutomations[agency]) {
          agencyAutomations[agency] = { total: 0, active: 0 };
        }
        agencyAutomations[agency].total++;
        if (auto.status === 'Active' || auto.status === 'active') {
          agencyAutomations[agency].active++;
        }
      }
    });

    return Object.entries(agencyUsers)
      .map(([name, users]) => ({
        name,
        totalUsers: users.total,
        activeUsers: users.active,
        totalAutomations: agencyAutomations[name]?.total || 0,
        activeAutomations: agencyAutomations[name]?.active || 0
      }))
      .sort((a, b) => b.activeUsers - a.activeUsers);
  },

  /**
   * Get system health metrics
   */
  async getSystemHealth() {
    const now = new Date();
    const hour1Ago = new Date(now.getTime() - 60 * 60 * 1000);
    const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      pendingEmails,
      failedLast24h,
      bouncedLast24h,
      sentLastHour,
      processingEmails
    ] = await Promise.all([
      supabase
        .from('scheduled_emails')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending'),

      supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Failed')
        .gte('created_at', hours24Ago.toISOString()),

      supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Bounced')
        .gte('bounced_at', hours24Ago.toISOString()),

      supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .gte('sent_at', hour1Ago.toISOString()),

      supabase
        .from('scheduled_emails')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Processing')
    ]);

    // Calculate health score (0-100)
    const failedRate = sentLastHour.count > 0 ? (failedLast24h.count / sentLastHour.count) : 0;
    const bounceRate = sentLastHour.count > 0 ? (bouncedLast24h.count / sentLastHour.count) : 0;
    const healthScore = Math.max(0, Math.min(100, 100 - (failedRate * 50) - (bounceRate * 30)));

    return {
      pendingEmails: pendingEmails.count || 0,
      processingEmails: processingEmails.count || 0,
      failedLast24h: failedLast24h.count || 0,
      bouncedLast24h: bouncedLast24h.count || 0,
      sentLastHour: sentLastHour.count || 0,
      healthScore: Math.round(healthScore),
      status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical'
    };
  },

  /**
   * Get recent activity feed - shows most recent email events
   */
  async getRecentActivity(limit = 20) {
    // Get recent sent emails
    const { data: recentSent, error: sentError } = await supabase
      .from('email_logs')
      .select(`
        id,
        status,
        sent_at,
        first_opened_at,
        first_clicked_at,
        first_replied_at,
        to_email,
        subject,
        account:accounts(name),
        owner:users(first_name, last_name, profile_name)
      `)
      .order('sent_at', { ascending: false })
      .limit(limit * 2);

    if (sentError) {
      console.error('Error fetching activity:', sentError);
      return [];
    }

    // Build activity list with individual events
    const activities = [];

    (recentSent || []).forEach(email => {
      const baseActivity = {
        id: email.id,
        email: email.to_email,
        subject: email.subject,
        accountName: email.account?.name,
        ownerName: `${email.owner?.first_name || ''} ${email.owner?.last_name || ''}`.trim(),
        agency: email.owner?.profile_name
      };

      // Add sent event
      if (email.sent_at) {
        activities.push({
          ...baseActivity,
          type: email.status === 'Bounced' ? 'bounced' : email.status === 'Failed' ? 'failed' : 'sent',
          timestamp: email.sent_at
        });
      }

      // Add opened event if exists
      if (email.first_opened_at) {
        activities.push({
          ...baseActivity,
          type: 'opened',
          timestamp: email.first_opened_at
        });
      }

      // Add clicked event if exists
      if (email.first_clicked_at) {
        activities.push({
          ...baseActivity,
          type: 'clicked',
          timestamp: email.first_clicked_at
        });
      }

      // Add replied event if exists
      if (email.first_replied_at) {
        activities.push({
          ...baseActivity,
          type: 'replied',
          timestamp: email.first_replied_at
        });
      }
    });

    // Sort by timestamp descending and take the limit
    return activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit)
      .map(a => ({ ...a, sentAt: a.timestamp }));
  },

  /**
   * Get detailed email reply analytics
   */
  async getEmailReplyAnalytics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prevStartDate = new Date();
    prevStartDate.setDate(prevStartDate.getDate() - days * 2);

    // Current period replies + previous period for comparison
    const [currentReplies, previousReplies, recentReplyDetails] = await Promise.all([
      supabase
        .from('email_logs')
        .select(`
          first_replied_at,
          to_email,
          subject,
          account_id,
          account:accounts(name, account_status),
          owner:users(first_name, last_name, profile_name)
        `)
        .not('first_replied_at', 'is', null)
        .gte('first_replied_at', startDate.toISOString()),

      supabase
        .from('email_logs')
        .select('first_replied_at')
        .not('first_replied_at', 'is', null)
        .gte('first_replied_at', prevStartDate.toISOString())
        .lt('first_replied_at', startDate.toISOString()),

      supabase
        .from('email_replies')
        .select('from_email, from_name, subject, created_at, body_text')
        .order('created_at', { ascending: false })
        .limit(15)
    ]);

    const replies = currentReplies.data || [];
    const prevCount = previousReplies.data?.length || 0;
    const totalReplies = replies.length;
    const changePercent = prevCount > 0 ? Math.round(((totalReplies - prevCount) / prevCount) * 100) : 0;

    // Group by agency
    const byAgency = {};
    replies.forEach(r => {
      const agency = r.owner?.profile_name || 'Unknown';
      if (!byAgency[agency]) byAgency[agency] = { name: agency, count: 0, accounts: new Set() };
      byAgency[agency].count++;
      if (r.account?.name) byAgency[agency].accounts.add(r.account.name);
    });

    const agencyBreakdown = Object.values(byAgency)
      .map(a => ({ name: a.name, count: a.count, uniqueAccounts: a.accounts.size }))
      .sort((a, b) => b.count - a.count);

    // Recent replies list
    const recentReplies = replies
      .sort((a, b) => new Date(b.first_replied_at) - new Date(a.first_replied_at))
      .slice(0, 15)
      .map(r => ({
        accountName: r.account?.name || r.to_email,
        accountStatus: r.account?.account_status || 'Unknown',
        subject: r.subject,
        ownerName: `${r.owner?.first_name || ''} ${r.owner?.last_name || ''}`.trim(),
        agency: r.owner?.profile_name,
        repliedAt: r.first_replied_at
      }));

    // Replies by day for mini-chart
    const dailyReplies = {};
    replies.forEach(r => {
      const date = r.first_replied_at?.split('T')[0];
      if (date) dailyReplies[date] = (dailyReplies[date] || 0) + 1;
    });

    return {
      totalReplies,
      changePercent,
      agencyBreakdown,
      recentReplies,
      dailyReplies,
      recentReplyDetails: (recentReplyDetails.data || []).map(r => ({
        from: r.from_name || r.from_email,
        subject: r.subject,
        preview: (r.body_text || '').substring(0, 120),
        receivedAt: r.created_at
      }))
    };
  },

  /**
   * Get quote opportunity analytics (prospects & leads)
   */
  async getQuoteOpportunities() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [prospects, leads, recentProspects] = await Promise.all([
      supabase
        .from('accounts')
        .select('account_unique_id, name, account_status, owner_id, created_at, person_email, owner:users(first_name, last_name, profile_name)', { count: 'exact' })
        .ilike('account_status', 'prospect'),

      supabase
        .from('accounts')
        .select('account_unique_id', { count: 'exact' })
        .ilike('account_status', 'lead'),

      supabase
        .from('accounts')
        .select('name, account_status, person_email, created_at, owner:users(first_name, last_name, profile_name)')
        .or('account_status.ilike.prospect,account_status.ilike.lead')
        .order('created_at', { ascending: false })
        .limit(20)
    ]);

    const prospectData = prospects.data || [];
    const totalProspects = prospects.count || 0;
    const totalLeads = leads.count || 0;

    // Group by agency
    const byAgency = {};
    prospectData.forEach(p => {
      const agency = p.owner?.profile_name || 'Unknown';
      if (!byAgency[agency]) byAgency[agency] = { name: agency, count: 0 };
      byAgency[agency].count++;
    });

    const agencyBreakdown = Object.values(byAgency)
      .sort((a, b) => b.count - a.count);

    // Recent prospects/leads
    const recentList = (recentProspects.data || []).map(p => ({
      name: p.name,
      status: p.account_status,
      email: p.person_email,
      ownerName: `${p.owner?.first_name || ''} ${p.owner?.last_name || ''}`.trim(),
      agency: p.owner?.profile_name,
      createdAt: p.created_at
    }));

    return {
      totalProspects,
      totalLeads,
      totalOpportunities: totalProspects + totalLeads,
      agencyBreakdown,
      recentList
    };
  },

  /**
   * Get sold account analytics — accounts that received marketing emails
   * and converted to "customer" status (from prospect/prior_customer).
   * A "sold" account = has email_logs AND current status is "customer".
   */
  async getSoldAccounts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Step 1: Get all customer accounts
    const { data: customers, count: totalCustomers } = await supabase
      .from('accounts')
      .select('account_unique_id, name, person_email, account_status, created_at, owner_id, owner:users(first_name, last_name, profile_name)', { count: 'exact' })
      .ilike('account_status', 'customer');

    const customerData = customers || [];
    const customerIds = customerData.map(c => c.account_unique_id);

    // Step 2: Find which customer accounts were actually emailed (marketing-driven conversions)
    let soldAccounts = [];
    let emailedCustomerIds = new Set();
    if (customerIds.length > 0) {
      // Query in batches if needed (Supabase has limits on IN clause)
      const batchSize = 500;
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize);
        const { data: emailLogs } = await supabase
          .from('email_logs')
          .select('account_id')
          .in('account_id', batch);
        (emailLogs || []).forEach(e => emailedCustomerIds.add(e.account_id));
      }

      soldAccounts = customerData.filter(c => emailedCustomerIds.has(c.account_unique_id));
    }

    const totalSold = soldAccounts.length;

    // Step 3: Get prior_customer count (lost accounts)
    const { count: totalPriorCustomers } = await supabase
      .from('accounts')
      .select('account_unique_id', { count: 'exact' })
      .ilike('account_status', 'prior_customer');

    // Group sold by agency
    const byAgency = {};
    soldAccounts.forEach(c => {
      const agency = c.owner?.profile_name || 'Unknown';
      if (!byAgency[agency]) byAgency[agency] = { name: agency, count: 0 };
      byAgency[agency].count++;
    });

    const agencyBreakdown = Object.values(byAgency)
      .sort((a, b) => b.count - a.count);

    // Recent sold (sorted by created_at desc)
    const recentList = soldAccounts
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map(c => ({
        name: c.name,
        email: c.person_email,
        ownerName: `${c.owner?.first_name || ''} ${c.owner?.last_name || ''}`.trim(),
        agency: c.owner?.profile_name,
        createdAt: c.created_at
      }));

    return {
      totalCustomers: totalCustomers || 0,
      totalSold,
      totalPriorCustomers: totalPriorCustomers || 0,
      conversionNote: 'Accounts that received marketing emails and are now customers',
      agencyBreakdown,
      recentList
    };
  },

  /**
   * Generate PDF report data
   */
  async generateReportData() {
    const [overview, topAgencies, topAutomations, topUsers, systemHealth] = await Promise.all([
      this.getPlatformOverview(),
      this.getTopAgencies(10),
      this.getTopAutomations(10),
      this.getTopUsers(10),
      this.getSystemHealth()
    ]);

    return {
      generatedAt: new Date().toISOString(),
      overview,
      topAgencies,
      topAutomations,
      topUsers,
      systemHealth
    };
  }

};

export default masterAdminAnalyticsService;
