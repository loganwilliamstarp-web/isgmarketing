// supabase/functions/send-agency-analytics/index.ts
// Edge function to send daily analytics email to agency admins at 7am
// Shows aggregate stats for their entire agency (all users in their profile_name)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

interface AgencyAnalyticsData {
  agencyName: string
  adminName: string
  adminEmail: string

  // Yesterday's stats (entire agency)
  emailsSentYesterday: number
  opensYesterday: number
  clicksYesterday: number
  repliesYesterday: number

  // Weekly stats
  emailsSentWeek: number
  openRate: number
  clickRate: number
  replyRate: number

  // Week over week changes
  sentChange: number
  openRateChange: number

  // Scheduled
  emailsScheduledToday: number
  emailsScheduledWeek: number

  // Team stats
  totalUsers: number
  activeUsersThisWeek: number

  // Top performers in the agency
  topUsers: { name: string; sent: number; openRate: number }[]

  // Top automations in the agency
  topAutomations: { name: string; ownerName: string; sent: number; openRate: number }[]

  // Accounts with replies
  accountsWithReplies: { name: string; replyCount: number }[]

  // Recent bounces
  recentBounces: { email: string; accountName: string; userName: string }[]

  // System health
  failedEmails24h: number
  bouncesYesterday: number
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
    const senderEmail = Deno.env.get('ANALYTICS_FROM_EMAIL') || 'noreply@isg-replies.com'
    const senderName = Deno.env.get('ANALYTICS_FROM_NAME') || 'Gizmo Analytics'

    // Parse request body for optional parameters
    let testMode = false
    let testEmail: string | null = null
    let specificAgency: string | null = null
    try {
      const body = await req.json()
      testMode = body.testMode || false
      testEmail = body.testEmail || null
      specificAgency = body.agencyName || null // For testing a specific agency
    } catch {
      // No body, run in normal mode
    }

    // Get all agency admins (marketing_cloud_agency_admin = true)
    let adminsQuery = supabaseClient
      .from('users')
      .select('user_unique_id, email, first_name, last_name, profile_name')
      .eq('marketing_cloud_agency_admin', true)
      .not('email', 'is', null)
      .not('profile_name', 'is', null)

    if (specificAgency) {
      adminsQuery = adminsQuery.eq('profile_name', specificAgency)
    }

    const { data: agencyAdmins, error: adminsError } = await adminsQuery

    if (adminsError) {
      throw new Error(`Failed to get agency admins: ${adminsError.message}`)
    }

    if (!agencyAdmins || agencyAdmins.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No agency admins to send to', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Group admins by agency (profile_name) - send one email per agency
    const agencyMap = new Map<string, typeof agencyAdmins>()
    for (const admin of agencyAdmins) {
      const agency = admin.profile_name
      if (!agencyMap.has(agency)) {
        agencyMap.set(agency, [])
      }
      agencyMap.get(agency)!.push(admin)
    }

    const emailSubject = `Agency Daily Report - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`

    let sent = 0
    let failed = 0
    let skipped = 0
    const errors: string[] = []

    for (const [agencyName, admins] of agencyMap) {
      try {
        // Gather analytics for this agency
        const analytics = await gatherAgencyAnalytics(supabaseClient, agencyName)

        // Skip if agency has no activity
        if (analytics.emailsSentWeek === 0 && analytics.emailsScheduledToday === 0 && !specificAgency) {
          skipped++
          continue
        }

        analytics.agencyName = agencyName

        // Build the email HTML
        const emailHtml = buildAgencyAnalyticsEmailHtml(analytics)

        // Send to all admins in this agency (or test email)
        for (const admin of admins) {
          const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin'
          analytics.adminName = adminName
          analytics.adminEmail = admin.email

          const recipientEmail = testMode && testEmail ? testEmail : admin.email
          const recipientName = adminName

          const result = await sendAnalyticsEmail(
            sendgridApiKey,
            recipientEmail,
            recipientName,
            senderEmail,
            senderName,
            emailSubject,
            emailHtml
          )

          if (result.success) {
            sent++

            // Log the sent email
            await supabaseClient
              .from('analytics_email_log')
              .insert({
                recipient_email: recipientEmail,
                recipient_name: recipientName,
                subject: emailSubject,
                sent_at: new Date().toISOString(),
                status: 'sent',
                email_type: 'agency_daily'
              })
          } else {
            failed++
            errors.push(`${recipientEmail}: ${result.error}`)
          }

          // In test mode with specific email, only send once
          if (testMode && testEmail) {
            break
          }
        }

        // In test mode with specific email, only send for one agency
        if (testMode && testEmail) {
          break
        }

      } catch (err: any) {
        failed++
        errors.push(`${agencyName}: ${err.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        skipped,
        totalAgencies: agencyMap.size,
        errors: errors.length > 0 ? errors : undefined,
        testMode
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function gatherAgencyAnalytics(supabase: any, agencyName: string): Promise<AgencyAnalyticsData> {
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const twoWeeksAgo = new Date(now)
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  // First, get all user IDs in this agency
  const { data: agencyUsers } = await supabase
    .from('users')
    .select('user_unique_id, first_name, last_name')
    .eq('profile_name', agencyName)
    .eq('marketing_cloud_engagement', true)

  const userIds = (agencyUsers || []).map((u: any) => u.user_unique_id)
  const userMap = new Map((agencyUsers || []).map((u: any) => [
    u.user_unique_id,
    `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown'
  ]))

  if (userIds.length === 0) {
    return getEmptyAgencyAnalytics(agencyName)
  }

  // Execute queries in parallel
  const [
    yesterdayStats,
    weekStats,
    previousWeekStats,
    scheduledToday,
    scheduledWeek,
    activeUsersData,
    topUsers,
    topAutomations,
    recentBounces,
    accountsWithReplies
  ] = await Promise.all([
    // Yesterday's stats for entire agency
    getAgencyEmailStats(supabase, userIds, yesterday.toISOString(), todayStart.toISOString()),

    // This week's stats for agency
    getAgencyEmailStats(supabase, userIds, weekAgo.toISOString(), now.toISOString()),

    // Previous week's stats (for comparison)
    getAgencyEmailStats(supabase, userIds, twoWeeksAgo.toISOString(), weekAgo.toISOString()),

    // Emails scheduled for today
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .in('owner_id', userIds)
      .eq('status', 'Pending')
      .gte('scheduled_for', todayStart.toISOString())
      .lt('scheduled_for', new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()),

    // Emails scheduled for this week
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .in('owner_id', userIds)
      .eq('status', 'Pending')
      .gte('scheduled_for', todayStart.toISOString())
      .lt('scheduled_for', new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Active users this week (who have sent at least one email)
    getActiveUsersCount(supabase, userIds, weekAgo.toISOString()),

    // Top users in the agency
    getTopUsersInAgency(supabase, userIds, userMap, weekAgo.toISOString()),

    // Top automations in the agency
    getTopAgencyAutomations(supabase, userIds, userMap),

    // Recent bounces for the agency
    getAgencyBounces(supabase, userIds, userMap, yesterday.toISOString()),

    // Accounts with replies for the agency
    getAgencyReplies(supabase, userIds, yesterday.toISOString())
  ])

  // Calculate changes
  const sentChange = previousWeekStats.sent > 0
    ? Math.round(((weekStats.sent - previousWeekStats.sent) / previousWeekStats.sent * 100) * 10) / 10
    : 0

  const openRateChange = previousWeekStats.openRate > 0
    ? Math.round((weekStats.openRate - previousWeekStats.openRate) * 10) / 10
    : 0

  return {
    agencyName,
    adminName: '',
    adminEmail: '',

    emailsSentYesterday: yesterdayStats.sent,
    opensYesterday: yesterdayStats.opened,
    clicksYesterday: yesterdayStats.clicked,
    repliesYesterday: yesterdayStats.replied,

    emailsSentWeek: weekStats.sent,
    openRate: weekStats.openRate,
    clickRate: weekStats.clickRate,
    replyRate: weekStats.replyRate,

    sentChange,
    openRateChange,

    emailsScheduledToday: scheduledToday.count || 0,
    emailsScheduledWeek: scheduledWeek.count || 0,

    totalUsers: userIds.length,
    activeUsersThisWeek: activeUsersData,

    topUsers,
    topAutomations,
    accountsWithReplies,
    recentBounces,

    failedEmails24h: yesterdayStats.failed,
    bouncesYesterday: yesterdayStats.bounced
  }
}

function getEmptyAgencyAnalytics(agencyName: string): AgencyAnalyticsData {
  return {
    agencyName,
    adminName: '',
    adminEmail: '',
    emailsSentYesterday: 0,
    opensYesterday: 0,
    clicksYesterday: 0,
    repliesYesterday: 0,
    emailsSentWeek: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    sentChange: 0,
    openRateChange: 0,
    emailsScheduledToday: 0,
    emailsScheduledWeek: 0,
    totalUsers: 0,
    activeUsersThisWeek: 0,
    topUsers: [],
    topAutomations: [],
    accountsWithReplies: [],
    recentBounces: [],
    failedEmails24h: 0,
    bouncesYesterday: 0
  }
}

async function getAgencyEmailStats(supabase: any, userIds: string[], startDate: string, endDate: string) {
  if (userIds.length === 0) {
    return { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0, openRate: 0, clickRate: 0, replyRate: 0 }
  }

  const { data, error } = await supabase
    .from('email_logs')
    .select('status, delivered_at, first_opened_at, first_clicked_at, first_replied_at, bounced_at')
    .in('owner_id', userIds)
    .gte('sent_at', startDate)
    .lt('sent_at', endDate)

  if (error) {
    console.error('Error fetching agency email stats:', error)
    return { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0, openRate: 0, clickRate: 0, replyRate: 0 }
  }

  const emails = data || []
  const sent = emails.length
  const delivered = emails.filter((e: any) => e.delivered_at).length
  const opened = emails.filter((e: any) => e.first_opened_at).length
  const clicked = emails.filter((e: any) => e.first_clicked_at).length
  const replied = emails.filter((e: any) => e.first_replied_at).length
  const bounced = emails.filter((e: any) => e.status === 'Bounced' || e.bounced_at).length
  const failed = emails.filter((e: any) => e.status === 'Failed').length

  const openRate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0
  const clickRate = delivered > 0 ? Math.round((clicked / delivered) * 1000) / 10 : 0
  const replyRate = delivered > 0 ? Math.round((replied / delivered) * 1000) / 10 : 0

  return { sent, delivered, opened, clicked, replied, bounced, failed, openRate, clickRate, replyRate }
}

async function getActiveUsersCount(supabase: any, userIds: string[], startDate: string): Promise<number> {
  if (userIds.length === 0) return 0

  const { data } = await supabase
    .from('email_logs')
    .select('owner_id')
    .in('owner_id', userIds)
    .gte('sent_at', startDate)

  const uniqueUsers = new Set((data || []).map((e: any) => e.owner_id))
  return uniqueUsers.size
}

async function getTopUsersInAgency(supabase: any, userIds: string[], userMap: Map<string, string>, startDate: string) {
  if (userIds.length === 0) return []

  const { data } = await supabase
    .from('email_logs')
    .select('owner_id, delivered_at, first_opened_at')
    .in('owner_id', userIds)
    .gte('sent_at', startDate)

  if (!data) return []

  // Group by user
  const userStats: Record<string, { sent: number; delivered: number; opened: number }> = {}
  for (const email of data) {
    if (!userStats[email.owner_id]) {
      userStats[email.owner_id] = { sent: 0, delivered: 0, opened: 0 }
    }
    userStats[email.owner_id].sent++
    if (email.delivered_at) userStats[email.owner_id].delivered++
    if (email.first_opened_at) userStats[email.owner_id].opened++
  }

  return Object.entries(userStats)
    .map(([userId, stats]) => ({
      name: userMap.get(userId) || 'Unknown',
      sent: stats.sent,
      openRate: stats.delivered > 0 ? Math.round((stats.opened / stats.delivered) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5)
}

async function getTopAgencyAutomations(supabase: any, userIds: string[], userMap: Map<string, string>) {
  if (userIds.length === 0) return []

  const { data } = await supabase
    .from('automations')
    .select('id, name, owner_id, stats')
    .in('owner_id', userIds)
    .in('status', ['Active', 'active'])

  if (!data) return []

  return data
    .filter((a: any) => a.stats?.sent > 0)
    .map((a: any) => ({
      name: a.name,
      ownerName: userMap.get(a.owner_id) || 'Unknown',
      sent: a.stats?.sent || 0,
      openRate: a.stats?.sent > 0
        ? Math.round(((a.stats?.opened || 0) / a.stats.sent) * 1000) / 10
        : 0
    }))
    .sort((a: any, b: any) => b.openRate - a.openRate)
    .slice(0, 5)
}

async function getAgencyBounces(supabase: any, userIds: string[], userMap: Map<string, string>, startDate: string) {
  if (userIds.length === 0) return []

  const { data } = await supabase
    .from('email_logs')
    .select(`
      to_email,
      owner_id,
      account:accounts(name)
    `)
    .in('owner_id', userIds)
    .eq('status', 'Bounced')
    .gte('bounced_at', startDate)
    .order('bounced_at', { ascending: false })
    .limit(5)

  if (!data) return []

  return data.map((b: any) => ({
    email: b.to_email,
    accountName: b.account?.name || 'Unknown',
    userName: userMap.get(b.owner_id) || 'Unknown'
  }))
}

async function getAgencyReplies(supabase: any, userIds: string[], startDate: string) {
  if (userIds.length === 0) return []

  const { data } = await supabase
    .from('email_replies')
    .select(`
      account:accounts(name)
    `)
    .in('owner_id', userIds)
    .gte('received_at', startDate)

  if (!data) return []

  // Group by account name
  const replyCounts: Record<string, number> = {}
  data.forEach((r: any) => {
    const name = r.account?.name || 'Unknown'
    replyCounts[name] = (replyCounts[name] || 0) + 1
  })

  return Object.entries(replyCounts)
    .map(([name, replyCount]) => ({ name, replyCount }))
    .sort((a, b) => b.replyCount - a.replyCount)
    .slice(0, 5)
}

function buildAgencyAnalyticsEmailHtml(analytics: AgencyAnalyticsData): string {
  const formatNumber = (n: number) => n.toLocaleString()
  const formatPercent = (n: number) => `${n}%`
  const formatChange = (n: number) => {
    if (n > 0) return `<span style="color: #10b981;">+${n}%</span>`
    if (n < 0) return `<span style="color: #ef4444;">${n}%</span>`
    return `<span style="color: #6b7280;">0%</span>`
  }
  const formatRateChange = (n: number) => {
    if (n > 0) return `<span style="color: #10b981;">+${n}pp</span>`
    if (n < 0) return `<span style="color: #ef4444;">${n}pp</span>`
    return `<span style="color: #6b7280;">0pp</span>`
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agency Daily Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #e5e7eb 0%, #f3f4f6 100%); border-radius: 16px 16px 0 0; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0 0 5px 0; color: #111827; font-size: 24px; font-weight: 700;">${analytics.agencyName}</h1>
      <p style="margin: 0; color: #374151; font-size: 14px;">Agency Daily Report - ${today}</p>
    </div>

    <!-- Main Content -->
    <div style="background: #ffffff; padding: 25px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">

      <!-- Team Overview -->
      <div style="background: #faf5ff; border-radius: 12px; padding: 15px; margin-bottom: 25px; text-align: center;">
        <div style="display: inline-block; width: 45%; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #7c3aed;">${formatNumber(analytics.totalUsers)}</div>
          <div style="font-size: 11px; color: #6b7280;">Total Users</div>
        </div>
        <div style="display: inline-block; width: 45%; text-align: center;">
          <div style="font-size: 28px; font-weight: 700; color: #7c3aed;">${formatNumber(analytics.activeUsersThisWeek)}</div>
          <div style="font-size: 11px; color: #6b7280;">Active This Week</div>
        </div>
      </div>

      <!-- Yesterday's Quick Stats - 2x2 Grid -->
      <div style="margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #111827;">Yesterday's Activity</h2>
        <div style="text-align: center;">
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #f0fdf4; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #059669;">${formatNumber(analytics.emailsSentYesterday)}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Sent</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #eff6ff; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #2563eb;">${formatNumber(analytics.opensYesterday)}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Opens</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #faf5ff; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #7c3aed;">${formatNumber(analytics.clicksYesterday)}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Clicks</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #fefce8; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #ca8a04;">${formatNumber(analytics.repliesYesterday)}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Replies</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly Performance - 2x2 Grid -->
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; margin-right: 8px;"></span>
          This Week's Performance
        </h2>
        <div style="text-align: center;">
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="font-size: 22px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsSentWeek)}</div>
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 3px;">SENT</div>
              <div style="font-size: 11px;">${formatChange(analytics.sentChange)} vs last week</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="font-size: 22px; font-weight: 700; color: #059669;">${formatPercent(analytics.openRate)}</div>
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 3px;">OPEN RATE</div>
              <div style="font-size: 11px;">${formatRateChange(analytics.openRateChange)} vs last week</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="font-size: 22px; font-weight: 700; color: #7c3aed;">${formatPercent(analytics.clickRate)}</div>
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 3px;">CLICK RATE</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 120px; max-width: 150px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="font-size: 22px; font-weight: 700; color: #ca8a04;">${formatPercent(analytics.replyRate)}</div>
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 3px;">REPLY RATE</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Scheduled Emails -->
      ${analytics.emailsScheduledToday > 0 || analytics.emailsScheduledWeek > 0 ? `
      <div style="background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%); border-radius: 12px; padding: 20px; margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1e40af;">
          Scheduled Emails
        </h2>
        <div style="text-align: center;">
          <div style="display: inline-block; width: 45%; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsScheduledToday)}</div>
            <div style="font-size: 11px; color: #3b82f6;">Today</div>
          </div>
          <div style="display: inline-block; width: 45%; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsScheduledWeek)}</div>
            <div style="font-size: 11px; color: #3b82f6;">This Week</div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Top Team Members -->
      ${analytics.topUsers.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; margin-right: 8px;"></span>
          Top Team Members This Week
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 6px 0 0 0;">Name</th>
              <th style="text-align: right; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Sent</th>
              <th style="text-align: right; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 0 6px 0 0;">Open Rate</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.topUsers.map((user, i) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-size: 13px; color: #111827;">
                  <span style="display: inline-block; width: 18px; height: 18px; background: ${['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i]}; color: white; border-radius: 50%; text-align: center; line-height: 18px; font-size: 10px; font-weight: 600; margin-right: 6px;">${i + 1}</span>
                  ${user.name}
                </td>
                <td style="text-align: right; padding: 10px; font-size: 13px; font-weight: 600; color: #1e40af;">${formatNumber(user.sent)}</td>
                <td style="text-align: right; padding: 10px; font-size: 13px; font-weight: 600; color: #059669;">${formatPercent(user.openRate)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Top Automations -->
      ${analytics.topAutomations.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; margin-right: 8px;"></span>
          Top Performing Automations
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 6px 0 0 0;">Automation</th>
              <th style="text-align: left; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Owner</th>
              <th style="text-align: right; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 0 6px 0 0;">Open Rate</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.topAutomations.map((auto) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-size: 13px; color: #111827;">${auto.name}</td>
                <td style="padding: 10px; font-size: 12px; color: #6b7280;">${auto.ownerName}</td>
                <td style="text-align: right; padding: 10px; font-size: 13px; font-weight: 600; color: #059669;">${formatPercent(auto.openRate)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Replies Received -->
      ${analytics.accountsWithReplies.length > 0 ? `
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 15px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #166534;">
          Accounts That Replied Yesterday
        </h3>
        <div>
          ${analytics.accountsWithReplies.map(account => `
            <span style="display: inline-block; background: #ffffff; border: 1px solid #a7f3d0; border-radius: 16px; padding: 4px 10px; font-size: 12px; color: #166534; margin: 2px;">
              ${account.name} <strong>(${account.replyCount})</strong>
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Bounces Alert -->
      ${analytics.recentBounces.length > 0 ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 15px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #991b1b;">
          Recent Bounces
        </h3>
        ${analytics.recentBounces.map(bounce => `
          <div style="font-size: 12px; color: #991b1b; padding: 3px 0;">
            ${bounce.email} <span style="color: #6b7280;">- ${bounce.accountName} (${bounce.userName})</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Health Status -->
      ${analytics.failedEmails24h > 0 || analytics.bouncesYesterday > 0 ? `
      <div style="background: ${analytics.failedEmails24h > 10 ? '#fef2f2' : '#f9fafb'}; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: ${analytics.failedEmails24h > 10 ? '#991b1b' : '#374151'};">
          Delivery Status
        </h3>
        <div style="text-align: center;">
          <div style="display: inline-block; width: 45%; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: ${analytics.failedEmails24h > 10 ? '#dc2626' : '#6b7280'};">${analytics.failedEmails24h}</div>
            <div style="font-size: 10px; color: #6b7280;">Failed (24h)</div>
          </div>
          <div style="display: inline-block; width: 45%; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: ${analytics.bouncesYesterday > 10 ? '#dc2626' : '#6b7280'};">${analytics.bouncesYesterday}</div>
            <div style="font-size: 10px; color: #6b7280;">Bounces</div>
          </div>
        </div>
      </div>
      ` : ''}

    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 11px;">
      <p style="margin: 0 0 5px 0;">This is your agency daily report from Gizmo</p>
      <p style="margin: 0;">Sent every morning at 7:00 AM to agency administrators</p>
    </div>

  </div>
</body>
</html>
  `.trim()
}

async function sendAnalyticsEmail(
  apiKey: string | undefined,
  recipientEmail: string,
  recipientName: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey) {
    console.log(`[DRY RUN] Would send agency analytics email from ${senderEmail} to ${recipientEmail}`)
    return { success: true }
  }

  const payload = {
    personalizations: [{
      to: [{
        email: recipientEmail,
        name: recipientName
      }]
    }],
    from: {
      email: senderEmail,
      name: senderName
    },
    subject,
    content: [
      { type: 'text/html', value: htmlContent }
    ],
    tracking_settings: {
      click_tracking: { enable: false },
      open_tracking: { enable: false }
    },
    categories: ['agency_analytics_report', 'daily_notification']
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (response.ok || response.status === 202) {
      return { success: true }
    } else {
      const errorBody = await response.text()
      return { success: false, error: `SendGrid error ${response.status}: ${errorBody.substring(0, 200)}` }
    }
  } catch (err: any) {
    return { success: false, error: `Network error: ${err.message}` }
  }
}
