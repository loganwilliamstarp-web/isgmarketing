// supabase/functions/send-daily-analytics/index.ts
// Edge function to send daily analytics email to master admins at midnight
// Should be invoked via pg_cron or external scheduler daily at midnight

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send'

interface AnalyticsData {
  // Overall email stats
  emailsSentYesterday: number
  emailsSentWeek: number
  emailsSentMonth: number
  emailsScheduledToday: number
  emailsScheduledWeek: number

  // Engagement metrics
  opensYesterday: number
  clicksYesterday: number
  repliesYesterday: number
  bouncesYesterday: number

  // Rates
  openRate: number
  clickRate: number
  bounceRate: number
  responseRate: number

  // Comparison (vs previous period)
  sentChange: number
  openRateChange: number
  clickRateChange: number

  // User/Agency breakdown
  totalUsers: number
  totalAgencies: number
  activeAutomations: number

  // Top performers
  topAgencies: { name: string; sent: number; openRate: number }[]
  topAutomations: { name: string; ownerName: string; sent: number; openRate: number }[]

  // Recent activity highlights
  recentBounces: { email: string; accountName: string; reason: string }[]
  accountsWithReplies: { name: string; replyCount: number }[]

  // System health
  failedEmails24h: number
  pendingVerification: number
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

    // Parse request body for optional parameters
    let testMode = false
    let testEmail: string | null = null
    try {
      const body = await req.json()
      testMode = body.testMode || false
      testEmail = body.testEmail || null
    } catch {
      // No body, run in normal mode
    }

    // Get the first master admin to use as sender
    const { data: adminUsers, error: adminError } = await supabaseClient
      .from('admin_users')
      .select('user_id, name')
      .limit(1)

    if (adminError) {
      throw new Error(`Failed to get admin users: ${adminError.message}`)
    }

    // Get the sender info from the first master admin
    const adminUser = adminUsers?.[0]
    const senderEmail = Deno.env.get('ANALYTICS_FROM_EMAIL') || 'noreply@isg-replies.com'
    const senderName = Deno.env.get('ANALYTICS_FROM_NAME') || 'Gizmo Analytics'

    // Always use Gizmo Analytics as the sender - don't override with admin user info

    // Gather analytics data
    const analytics = await gatherAnalyticsData(supabaseClient)

    // Build the email HTML
    const emailHtml = buildAnalyticsEmailHtml(analytics)
    const emailSubject = `Daily Analytics Report - ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`

    // Fixed recipient: ljohns@isgdfw.com (or test email in test mode)
    const recipientEmail = testMode && testEmail
      ? testEmail
      : Deno.env.get('ANALYTICS_RECIPIENT_EMAIL') || 'ljohns@isgdfw.com'
    const recipientName = Deno.env.get('ANALYTICS_RECIPIENT_NAME') || 'Admin'

    const recipients = [{ email: recipientEmail, name: recipientName }]

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No valid recipient emails found', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send emails
    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const recipient of recipients) {
      const result = await sendAnalyticsEmail(
        sendgridApiKey,
        recipient.email,
        recipient.name,
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
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            subject: emailSubject,
            sent_at: new Date().toISOString(),
            status: 'sent'
          })
          .select()
      } else {
        failed++
        errors.push(`${recipient.email}: ${result.error}`)

        // Log the failure
        await supabaseClient
          .from('analytics_email_log')
          .insert({
            recipient_email: recipient.email,
            recipient_name: recipient.name,
            subject: emailSubject,
            sent_at: new Date().toISOString(),
            status: 'failed',
            error_message: result.error
          })
          .select()
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        errors: errors.length > 0 ? errors : undefined,
        testMode,
        analytics: testMode ? analytics : undefined
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

async function gatherAnalyticsData(supabase: any): Promise<AnalyticsData> {
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

  const monthAgo = new Date(now)
  monthAgo.setDate(monthAgo.getDate() - 30)

  // Execute all queries in parallel for performance
  const [
    yesterdayStats,
    weekStats,
    previousWeekStats,
    monthStats,
    scheduledToday,
    scheduledWeek,
    usersCount,
    agenciesData,
    automationsCount,
    failedEmails,
    pendingVerification,
    topAgencies,
    topAutomations,
    recentBounces,
    accountsWithReplies
  ] = await Promise.all([
    // Yesterday's email stats
    getEmailStats(supabase, yesterday.toISOString(), todayStart.toISOString()),

    // This week's stats
    getEmailStats(supabase, weekAgo.toISOString(), now.toISOString()),

    // Previous week's stats (for comparison)
    getEmailStats(supabase, twoWeeksAgo.toISOString(), weekAgo.toISOString()),

    // This month's stats
    getEmailStats(supabase, monthAgo.toISOString(), now.toISOString()),

    // Emails scheduled for today
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .gte('scheduled_for', todayStart.toISOString())
      .lt('scheduled_for', new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()),

    // Emails scheduled for this week
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .gte('scheduled_for', todayStart.toISOString())
      .lt('scheduled_for', new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Total users
    supabase
      .from('users')
      .select('user_unique_id', { count: 'exact', head: true }),

    // Total agencies (unique profile_names)
    supabase
      .from('users')
      .select('profile_name')
      .not('profile_name', 'is', null),

    // Active automations
    supabase
      .from('automations')
      .select('id', { count: 'exact', head: true })
      .in('status', ['Active', 'active']),

    // Failed emails in last 24 hours
    supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Failed')
      .gte('created_at', yesterday.toISOString()),

    // Pending verification
    supabase
      .from('scheduled_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .eq('requires_verification', true),

    // Top agencies by email volume
    getTopAgencies(supabase, weekAgo.toISOString()),

    // Top automations by performance
    getTopAutomations(supabase),

    // Recent bounces
    getRecentBounces(supabase, yesterday.toISOString()),

    // Accounts with replies yesterday
    getAccountsWithReplies(supabase, yesterday.toISOString())
  ])

  // Calculate unique agencies
  const uniqueAgencies = new Set(agenciesData.data?.map((u: any) => u.profile_name) || [])

  // Calculate rate changes
  const sentChange = previousWeekStats.sent > 0
    ? ((weekStats.sent - previousWeekStats.sent) / previousWeekStats.sent * 100)
    : 0

  const openRateChange = previousWeekStats.openRate > 0
    ? (weekStats.openRate - previousWeekStats.openRate)
    : 0

  const clickRateChange = previousWeekStats.clickRate > 0
    ? (weekStats.clickRate - previousWeekStats.clickRate)
    : 0

  return {
    emailsSentYesterday: yesterdayStats.sent,
    emailsSentWeek: weekStats.sent,
    emailsSentMonth: monthStats.sent,
    emailsScheduledToday: scheduledToday.count || 0,
    emailsScheduledWeek: scheduledWeek.count || 0,

    opensYesterday: yesterdayStats.opened,
    clicksYesterday: yesterdayStats.clicked,
    repliesYesterday: yesterdayStats.replied,
    bouncesYesterday: yesterdayStats.bounced,

    openRate: weekStats.openRate,
    clickRate: weekStats.clickRate,
    bounceRate: weekStats.bounceRate,
    responseRate: weekStats.responseRate,

    sentChange: Math.round(sentChange * 10) / 10,
    openRateChange: Math.round(openRateChange * 10) / 10,
    clickRateChange: Math.round(clickRateChange * 10) / 10,

    totalUsers: usersCount.count || 0,
    totalAgencies: uniqueAgencies.size,
    activeAutomations: automationsCount.count || 0,

    topAgencies: topAgencies,
    topAutomations: topAutomations,

    recentBounces: recentBounces,
    accountsWithReplies: accountsWithReplies,

    failedEmails24h: failedEmails.count || 0,
    pendingVerification: pendingVerification.count || 0
  }
}

async function getEmailStats(supabase: any, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('email_logs')
    .select('status, delivered_at, first_opened_at, first_clicked_at, first_replied_at, bounced_at')
    .gte('sent_at', startDate)
    .lt('sent_at', endDate)

  if (error) {
    console.error('Error fetching email stats:', error)
    return { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, openRate: 0, clickRate: 0, bounceRate: 0, responseRate: 0 }
  }

  const emails = data || []
  const sent = emails.length
  const delivered = emails.filter((e: any) => e.delivered_at).length
  const opened = emails.filter((e: any) => e.first_opened_at).length
  const clicked = emails.filter((e: any) => e.first_clicked_at).length
  const replied = emails.filter((e: any) => e.first_replied_at).length
  const bounced = emails.filter((e: any) => e.status === 'Bounced' || e.bounced_at).length

  const openRate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0
  const clickRate = delivered > 0 ? Math.round((clicked / delivered) * 1000) / 10 : 0
  const bounceRate = sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0
  const responseRate = delivered > 0 ? Math.round((replied / delivered) * 1000) / 10 : 0

  return { sent, delivered, opened, clicked, replied, bounced, openRate, clickRate, bounceRate, responseRate }
}

async function getTopAgencies(supabase: any, startDate: string) {
  // Get email stats grouped by owner, then aggregate by agency
  const { data: emails, error } = await supabase
    .from('email_logs')
    .select(`
      owner_id,
      status,
      delivered_at,
      first_opened_at,
      owner:users!inner(profile_name)
    `)
    .gte('sent_at', startDate)
    .not('owner_id', 'is', null)

  if (error || !emails) {
    console.error('Error fetching agency stats:', error)
    return []
  }

  // Group by agency
  const agencyStats: Record<string, { sent: number; delivered: number; opened: number }> = {}

  emails.forEach((email: any) => {
    const agency = email.owner?.profile_name || 'Unknown'
    if (!agencyStats[agency]) {
      agencyStats[agency] = { sent: 0, delivered: 0, opened: 0 }
    }
    agencyStats[agency].sent++
    if (email.delivered_at) agencyStats[agency].delivered++
    if (email.first_opened_at) agencyStats[agency].opened++
  })

  // Convert to array and sort by sent count
  return Object.entries(agencyStats)
    .map(([name, stats]) => ({
      name,
      sent: stats.sent,
      openRate: stats.delivered > 0 ? Math.round((stats.opened / stats.delivered) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5)
}

async function getTopAutomations(supabase: any) {
  const { data: automations, error } = await supabase
    .from('automations')
    .select(`
      id,
      name,
      stats,
      owner:users!inner(first_name, last_name, profile_name)
    `)
    .in('status', ['Active', 'active'])
    .not('stats', 'is', null)

  if (error || !automations) {
    console.error('Error fetching automation stats:', error)
    return []
  }

  return automations
    .filter((a: any) => a.stats?.sent > 0)
    .map((a: any) => ({
      name: a.name,
      ownerName: a.owner?.profile_name || `${a.owner?.first_name || ''} ${a.owner?.last_name || ''}`.trim() || 'Unknown',
      sent: a.stats?.sent || 0,
      openRate: a.stats?.sent > 0
        ? Math.round(((a.stats?.opened || 0) / a.stats.sent) * 1000) / 10
        : 0
    }))
    .sort((a: any, b: any) => b.openRate - a.openRate)
    .slice(0, 5)
}

async function getRecentBounces(supabase: any, startDate: string) {
  const { data, error } = await supabase
    .from('email_logs')
    .select(`
      to_email,
      error_message,
      account:accounts(name)
    `)
    .eq('status', 'Bounced')
    .gte('bounced_at', startDate)
    .order('bounced_at', { ascending: false })
    .limit(5)

  if (error || !data) {
    console.error('Error fetching bounces:', error)
    return []
  }

  return data.map((b: any) => ({
    email: b.to_email,
    accountName: b.account?.name || 'Unknown',
    reason: b.error_message || 'Unknown reason'
  }))
}

async function getAccountsWithReplies(supabase: any, startDate: string) {
  const { data, error } = await supabase
    .from('email_replies')
    .select(`
      account:accounts(name)
    `)
    .gte('received_at', startDate)

  if (error || !data) {
    console.error('Error fetching replies:', error)
    return []
  }

  // Group by account name and count
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

function buildAnalyticsEmailHtml(analytics: AnalyticsData): string {
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
  <title>Daily Analytics Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <div style="max-width: 700px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0 0 10px 0; color: #ffffff; font-size: 28px; font-weight: 700;">Daily Analytics Report</h1>
      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px;">${today}</p>
    </div>

    <!-- Main Content -->
    <div style="background: #ffffff; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">

      <!-- Quick Stats Row -->
      <div style="display: table; width: 100%; margin-bottom: 30px;">
        <div style="display: table-row;">
          <!-- Yesterday's Sends -->
          <div style="display: table-cell; width: 25%; text-align: center; padding: 15px; border-right: 1px solid #e5e7eb;">
            <div style="font-size: 32px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsSentYesterday)}</div>
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Sent Yesterday</div>
          </div>
          <!-- Opens -->
          <div style="display: table-cell; width: 25%; text-align: center; padding: 15px; border-right: 1px solid #e5e7eb;">
            <div style="font-size: 32px; font-weight: 700; color: #059669;">${formatNumber(analytics.opensYesterday)}</div>
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Opens</div>
          </div>
          <!-- Clicks -->
          <div style="display: table-cell; width: 25%; text-align: center; padding: 15px; border-right: 1px solid #e5e7eb;">
            <div style="font-size: 32px; font-weight: 700; color: #7c3aed;">${formatNumber(analytics.clicksYesterday)}</div>
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Clicks</div>
          </div>
          <!-- Replies -->
          <div style="display: table-cell; width: 25%; text-align: center; padding: 15px;">
            <div style="font-size: 32px; font-weight: 700; color: #f59e0b;">${formatNumber(analytics.repliesYesterday)}</div>
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Replies</div>
          </div>
        </div>
      </div>

      <!-- Weekly Performance Section -->
      <div style="background: #f9fafb; border-radius: 12px; padding: 25px; margin-bottom: 25px;">
        <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; margin-right: 10px;"></span>
          Weekly Performance
        </h2>

        <!-- 2x2 Grid layout that works on mobile -->
        <div style="text-align: center;">
          <!-- Row 1 -->
          <div style="display: inline-block; width: 45%; min-width: 140px; max-width: 200px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <div style="font-size: 24px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsSentWeek)}</div>
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 5px;">EMAILS SENT</div>
              <div style="font-size: 12px;">${formatChange(analytics.sentChange)} vs last week</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 140px; max-width: 200px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <div style="font-size: 24px; font-weight: 700; color: #059669;">${formatPercent(analytics.openRate)}</div>
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 5px;">OPEN RATE</div>
              <div style="font-size: 12px;">${formatRateChange(analytics.openRateChange)} vs last week</div>
            </div>
          </div>
          <!-- Row 2 -->
          <div style="display: inline-block; width: 45%; min-width: 140px; max-width: 200px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${formatPercent(analytics.clickRate)}</div>
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 5px;">CLICK RATE</div>
              <div style="font-size: 12px;">${formatRateChange(analytics.clickRateChange)} vs last week</div>
            </div>
          </div>
          <div style="display: inline-block; width: 45%; min-width: 140px; max-width: 200px; padding: 5px; vertical-align: top;">
            <div style="background: #ffffff; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${formatPercent(analytics.responseRate)}</div>
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 5px;">REPLY RATE</div>
              <div style="font-size: 12px; color: #6b7280;">replies/delivered</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming & System Health Row -->
      <div style="display: table; width: 100%; margin-bottom: 25px;">
        <div style="display: table-row;">
          <!-- Scheduled Emails -->
          <div style="display: table-cell; width: 50%; padding-right: 10px; vertical-align: top;">
            <div style="background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%); border-radius: 12px; padding: 20px;">
              <h3 style="margin: 0 0 15px 0; font-size: 14px; font-weight: 600; color: #1e40af;">
                Scheduled Emails
              </h3>
              <div style="display: table; width: 100%;">
                <div style="display: table-row;">
                  <div style="display: table-cell; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsScheduledToday)}</div>
                    <div style="font-size: 11px; color: #3b82f6;">Today</div>
                  </div>
                  <div style="display: table-cell; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #1e40af;">${formatNumber(analytics.emailsScheduledWeek)}</div>
                    <div style="font-size: 11px; color: #3b82f6;">This Week</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- System Health -->
          <div style="display: table-cell; width: 50%; padding-left: 10px; vertical-align: top;">
            <div style="background: ${analytics.failedEmails24h > 10 || analytics.bouncesYesterday > 20 ? 'linear-gradient(135deg, #fee2e2 0%, #fef2f2 100%)' : 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)'}; border-radius: 12px; padding: 20px;">
              <h3 style="margin: 0 0 15px 0; font-size: 14px; font-weight: 600; color: ${analytics.failedEmails24h > 10 || analytics.bouncesYesterday > 20 ? '#991b1b' : '#166534'};">
                System Health
              </h3>
              <div style="display: table; width: 100%;">
                <div style="display: table-row;">
                  <div style="display: table-cell; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: ${analytics.failedEmails24h > 10 ? '#dc2626' : '#166534'};">${formatNumber(analytics.failedEmails24h)}</div>
                    <div style="font-size: 11px; color: #6b7280;">Failed (24h)</div>
                  </div>
                  <div style="display: table-cell; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: ${analytics.bouncesYesterday > 20 ? '#dc2626' : '#166534'};">${formatNumber(analytics.bouncesYesterday)}</div>
                    <div style="font-size: 11px; color: #6b7280;">Bounces</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Platform Overview -->
      <div style="background: #f9fafb; border-radius: 12px; padding: 25px; margin-bottom: 25px;">
        <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #8b5cf6; border-radius: 50%; margin-right: 10px;"></span>
          Platform Overview
        </h2>
        <div style="display: table; width: 100%;">
          <div style="display: table-row;">
            <div style="display: table-cell; width: 33%; text-align: center; padding: 10px;">
              <div style="font-size: 28px; font-weight: 700; color: #4f46e5;">${formatNumber(analytics.totalUsers)}</div>
              <div style="font-size: 12px; color: #6b7280;">Total Users</div>
            </div>
            <div style="display: table-cell; width: 33%; text-align: center; padding: 10px;">
              <div style="font-size: 28px; font-weight: 700; color: #4f46e5;">${formatNumber(analytics.totalAgencies)}</div>
              <div style="font-size: 12px; color: #6b7280;">Agencies</div>
            </div>
            <div style="display: table-cell; width: 33%; text-align: center; padding: 10px;">
              <div style="font-size: 28px; font-weight: 700; color: #4f46e5;">${formatNumber(analytics.activeAutomations)}</div>
              <div style="font-size: 12px; color: #6b7280;">Active Automations</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Agencies -->
      ${analytics.topAgencies.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; margin-right: 10px;"></span>
          Top Agencies This Week
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 8px 0 0 0;">Agency</th>
              <th style="text-align: right; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Emails Sent</th>
              <th style="text-align: right; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 0 8px 0 0;">Open Rate</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.topAgencies.map((agency, i) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-size: 14px; color: #111827;">
                  <span style="display: inline-block; width: 20px; height: 20px; background: ${['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i]}; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 600; margin-right: 8px;">${i + 1}</span>
                  ${agency.name}
                </td>
                <td style="text-align: right; padding: 12px; font-size: 14px; font-weight: 600; color: #1e40af;">${formatNumber(agency.sent)}</td>
                <td style="text-align: right; padding: 12px; font-size: 14px; font-weight: 600; color: #059669;">${formatPercent(agency.openRate)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Top Automations -->
      ${analytics.topAutomations.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #111827;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #f59e0b; border-radius: 50%; margin-right: 10px;"></span>
          Top Performing Automations
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 8px 0 0 0;">Automation</th>
              <th style="text-align: left; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Owner</th>
              <th style="text-align: right; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;">Sent</th>
              <th style="text-align: right; padding: 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-radius: 0 8px 0 0;">Open Rate</th>
            </tr>
          </thead>
          <tbody>
            ${analytics.topAutomations.map((auto, i) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px; font-size: 14px; color: #111827;">
                  <span style="display: inline-block; width: 20px; height: 20px; background: ${['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'][i]}; color: white; border-radius: 50%; text-align: center; line-height: 20px; font-size: 11px; font-weight: 600; margin-right: 8px;">${i + 1}</span>
                  ${auto.name}
                </td>
                <td style="padding: 12px; font-size: 13px; color: #6b7280;">${auto.ownerName}</td>
                <td style="text-align: right; padding: 12px; font-size: 14px; font-weight: 600; color: #1e40af;">${formatNumber(auto.sent)}</td>
                <td style="text-align: right; padding: 12px; font-size: 14px; font-weight: 600; color: #059669;">${formatPercent(auto.openRate)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}

      <!-- Recent Bounces Alert -->
      ${analytics.recentBounces.length > 0 ? `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #991b1b;">
          Recent Bounces
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${analytics.recentBounces.map(bounce => `
            <tr>
              <td style="padding: 8px 0; font-size: 13px; color: #111827; border-bottom: 1px solid #fecaca;">
                <strong>${bounce.email}</strong>
                <span style="color: #6b7280;"> - ${bounce.accountName}</span>
                <div style="font-size: 12px; color: #991b1b; margin-top: 2px;">${bounce.reason.substring(0, 80)}${bounce.reason.length > 80 ? '...' : ''}</div>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      <!-- Accounts with Replies -->
      ${analytics.accountsWithReplies.length > 0 ? `
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #166534;">
          Accounts That Replied Yesterday
        </h3>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${analytics.accountsWithReplies.map(account => `
            <span style="background: #ffffff; border: 1px solid #a7f3d0; border-radius: 20px; padding: 6px 12px; font-size: 13px; color: #166534;">
              ${account.name} <strong>(${account.replyCount})</strong>
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Monthly Summary -->
      <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 25px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #5b21b6;">
          30-Day Summary
        </h2>
        <div style="display: table; width: 100%;">
          <div style="display: table-row;">
            <div style="display: table-cell; text-align: center; padding: 10px;">
              <div style="font-size: 32px; font-weight: 700; color: #5b21b6;">${formatNumber(analytics.emailsSentMonth)}</div>
              <div style="font-size: 12px; color: #7c3aed;">Emails Sent</div>
            </div>
            <div style="display: table-cell; text-align: center; padding: 10px;">
              <div style="font-size: 32px; font-weight: 700; color: #5b21b6;">${formatPercent(analytics.bounceRate)}</div>
              <div style="font-size: 12px; color: #7c3aed;">Bounce Rate</div>
            </div>
            <div style="display: table-cell; text-align: center; padding: 10px;">
              <div style="font-size: 32px; font-weight: 700; color: #5b21b6;">${formatNumber(analytics.pendingVerification)}</div>
              <div style="font-size: 12px; color: #7c3aed;">Pending Verification</div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
      <p style="margin: 0 0 5px 0;">This is an automated report from ISG Marketing Platform</p>
      <p style="margin: 0;">Sent to master administrators daily at midnight</p>
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
    console.log(`[DRY RUN] Would send analytics email from ${senderEmail} to ${recipientEmail}`)
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
    categories: ['analytics_report', 'admin_notification']
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
