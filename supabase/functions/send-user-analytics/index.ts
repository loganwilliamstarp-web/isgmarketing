// supabase/functions/send-user-analytics/index.ts
// Edge function to send daily analytics email to individual marketing users at 7am
// Shows each user their own email performance stats only

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

interface UserAnalyticsData {
  userName: string
  userEmail: string

  // Yesterday's stats
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

  // Active automations
  activeAutomations: { name: string; sent: number; openRate: number }[]

  // Accounts with replies
  accountsWithReplies: { name: string; replyCount: number }[]

  // Recent bounces
  recentBounces: { email: string; accountName: string }[]

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
    let specificUserId: string | null = null
    try {
      const body = await req.json()
      testMode = body.testMode || false
      testEmail = body.testEmail || null
      specificUserId = body.userId || null // For testing a specific user
    } catch {
      // No body, run in normal mode
    }

    // Get all active marketing users (marketing_cloud_engagement = true)
    // Exclude agency admins - they get a separate agency-level email
    let usersQuery = supabaseClient
      .from('users')
      .select('user_unique_id, email, first_name, last_name, profile_name, marketing_cloud_agency_admin')
      .eq('marketing_cloud_engagement', true)
      .not('email', 'is', null)
      .or('marketing_cloud_agency_admin.is.null,marketing_cloud_agency_admin.eq.false')

    if (specificUserId) {
      usersQuery = usersQuery.eq('user_unique_id', specificUserId)
    }

    const { data: users, error: usersError } = await usersQuery

    if (usersError) {
      throw new Error(`Failed to get users: ${usersError.message}`)
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No marketing users to send to', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter to users who have sent at least one email in the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: activeUsers } = await supabaseClient
      .from('email_logs')
      .select('owner_id')
      .gte('sent_at', thirtyDaysAgo.toISOString())
      .not('owner_id', 'is', null)

    const activeUserIds = new Set((activeUsers || []).map((u: any) => u.owner_id))

    // If specific user requested in test mode, don't filter
    const eligibleUsers = specificUserId
      ? users
      : users.filter((u: any) => activeUserIds.has(u.user_unique_id))

    const emailSubject = `Your Daily Email Report - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`

    let sent = 0
    let failed = 0
    let skipped = 0
    const errors: string[] = []

    for (const user of eligibleUsers) {
      try {
        // Gather analytics for this specific user
        const analytics = await gatherUserAnalytics(supabaseClient, user.user_unique_id)

        // Skip if user has no activity at all
        if (analytics.emailsSentWeek === 0 && analytics.emailsScheduledToday === 0 && !specificUserId) {
          skipped++
          continue
        }

        // Set user info
        analytics.userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'there'
        analytics.userEmail = user.email

        // Build the email HTML
        const emailHtml = buildUserAnalyticsEmailHtml(analytics)

        // Send to test email or actual user
        const recipientEmail = testMode && testEmail ? testEmail : user.email
        const recipientName = analytics.userName

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
              email_type: 'user_daily'
            })
        } else {
          failed++
          errors.push(`${recipientEmail}: ${result.error}`)
        }

        // In test mode with specific email, only send once
        if (testMode && testEmail) {
          break
        }

      } catch (err: any) {
        failed++
        errors.push(`${user.email}: ${err.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        skipped,
        totalUsers: eligibleUsers.length,
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

async function gatherUserAnalytics(supabase: any, userId: string): Promise<UserAnalyticsData> {
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

  // Execute queries in parallel
  const [
    yesterdayStats,
    weekStats,
    previousWeekStats,
    scheduledToday,
    scheduledWeek,
    activeAutomations,
    recentBounces,
    accountsWithReplies
  ] = await Promise.all([
    // Yesterday's stats for this user
    getUserEmailStats(supabase, userId, yesterday.toISOString(), todayStart.toISOString()),

    // This week's stats for this user
    getUserEmailStats(supabase, userId, weekAgo.toISOString(), now.toISOString()),

    // Previous week's stats (for comparison)
    getUserEmailStats(supabase, userId, twoWeeksAgo.toISOString(), weekAgo.toISOString()),

    // Emails scheduled for today
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('status', 'Pending')
      .gte('scheduled_for', todayStart.toISOString())
      .lt('scheduled_for', new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()),

    // Emails scheduled for this week
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('status', 'Pending')
      .gte('scheduled_for', todayStart.toISOString())
      .lt('scheduled_for', new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),

    // User's active automations with stats
    getUserAutomations(supabase, userId),

    // Recent bounces for this user
    getUserBounces(supabase, userId, yesterday.toISOString()),

    // Accounts with replies for this user
    getUserReplies(supabase, userId, yesterday.toISOString())
  ])

  // Calculate changes
  const sentChange = previousWeekStats.sent > 0
    ? Math.round(((weekStats.sent - previousWeekStats.sent) / previousWeekStats.sent * 100) * 10) / 10
    : 0

  const openRateChange = previousWeekStats.openRate > 0
    ? Math.round((weekStats.openRate - previousWeekStats.openRate) * 10) / 10
    : 0

  return {
    userName: '',
    userEmail: '',

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

    activeAutomations,
    accountsWithReplies,
    recentBounces,

    failedEmails24h: yesterdayStats.failed,
    bouncesYesterday: yesterdayStats.bounced
  }
}

async function getUserEmailStats(supabase: any, userId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('email_logs')
    .select('status, delivered_at, first_opened_at, first_clicked_at, first_replied_at, bounced_at')
    .eq('owner_id', userId)
    .gte('sent_at', startDate)
    .lt('sent_at', endDate)

  if (error) {
    console.error('Error fetching user email stats:', error)
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

async function getUserAutomations(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('automations')
    .select('id, name, stats')
    .eq('owner_id', userId)
    .in('status', ['Active', 'active'])

  if (error || !data) {
    console.error('Error fetching user automations:', error)
    return []
  }

  return data
    .filter((a: any) => a.stats?.sent > 0)
    .map((a: any) => ({
      name: a.name,
      sent: a.stats?.sent || 0,
      openRate: a.stats?.sent > 0
        ? Math.round(((a.stats?.opened || 0) / a.stats.sent) * 1000) / 10
        : 0
    }))
    .sort((a: any, b: any) => b.sent - a.sent)
    .slice(0, 3)
}

async function getUserBounces(supabase: any, userId: string, startDate: string) {
  const { data, error } = await supabase
    .from('email_logs')
    .select(`
      to_email,
      account:accounts(name)
    `)
    .eq('owner_id', userId)
    .eq('status', 'Bounced')
    .gte('bounced_at', startDate)
    .order('bounced_at', { ascending: false })
    .limit(3)

  if (error || !data) {
    return []
  }

  return data.map((b: any) => ({
    email: b.to_email,
    accountName: b.account?.name || 'Unknown'
  }))
}

async function getUserReplies(supabase: any, userId: string, startDate: string) {
  const { data, error } = await supabase
    .from('email_replies')
    .select(`
      account:accounts(name)
    `)
    .eq('owner_id', userId)
    .gte('received_at', startDate)

  if (error || !data) {
    return []
  }

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

function buildUserAnalyticsEmailHtml(analytics: UserAnalyticsData): string {
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
  <title>Your Daily Email Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #e5e7eb 0%, #f3f4f6 100%); border-radius: 16px 16px 0 0; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0 0 5px 0; color: #111827; font-size: 24px; font-weight: 700;">Good Morning${analytics.userName ? `, ${analytics.userName.split(' ')[0]}` : ''}!</h1>
      <p style="margin: 0; color: #374151; font-size: 14px;">Here's your email performance for ${today}</p>
    </div>

    <!-- Main Content -->
    <div style="background: #ffffff; padding: 25px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">

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

      <!-- Active Automations -->
      ${analytics.activeAutomations.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; margin-right: 8px;"></span>
          Your Active Automations
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 6px 0 0 0;">Automation</th>
              <th style="text-align: right; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Sent</th>
              <th style="text-align: right; padding: 10px; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 0 6px 0 0;">Open Rate</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.activeAutomations.map((auto) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-size: 13px; color: #111827;">${auto.name}</td>
                <td style="text-align: right; padding: 10px; font-size: 13px; font-weight: 600; color: #1e40af;">${formatNumber(auto.sent)}</td>
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
            ${bounce.email} <span style="color: #6b7280;">- ${bounce.accountName}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Health Status -->
      ${analytics.failedEmails24h > 0 || analytics.bouncesYesterday > 0 ? `
      <div style="background: ${analytics.failedEmails24h > 5 ? '#fef2f2' : '#f9fafb'}; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: ${analytics.failedEmails24h > 5 ? '#991b1b' : '#374151'};">
          Delivery Status
        </h3>
        <div style="text-align: center;">
          <div style="display: inline-block; width: 45%; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: ${analytics.failedEmails24h > 5 ? '#dc2626' : '#6b7280'};">${analytics.failedEmails24h}</div>
            <div style="font-size: 10px; color: #6b7280;">Failed (24h)</div>
          </div>
          <div style="display: inline-block; width: 45%; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: ${analytics.bouncesYesterday > 5 ? '#dc2626' : '#6b7280'};">${analytics.bouncesYesterday}</div>
            <div style="font-size: 10px; color: #6b7280;">Bounces</div>
          </div>
        </div>
      </div>
      ` : ''}

    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 11px;">
      <p style="margin: 0 0 5px 0;">This is your daily performance report from Gizmo</p>
      <p style="margin: 0;">Sent every morning at 7:00 AM</p>
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
    console.log(`[DRY RUN] Would send user analytics email from ${senderEmail} to ${recipientEmail}`)
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
    categories: ['user_analytics_report', 'daily_notification']
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
