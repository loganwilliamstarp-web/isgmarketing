// src/pages/ReportsPage.jsx
// Reports & Analytics Dashboard

import React, { useState } from 'react';
import { useReportsDashboard, useEmailPerformanceReport, useReportExport, usePipelineReport } from '../hooks/useReports';
import { useCurrentNPS, useNPSTrend, useRecentSurveyResponses, useSurveyResponseRate } from '../hooks/useNPS';
import { LineChart, NPSGauge, NPSBreakdownBar } from '../components/charts';
import { DateRangeSelector, ExportButton, RecentFeedback } from '../components/reports';
import { npsService } from '../services/nps';

// Loading skeleton component
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div
    style={{
      width,
      height,
      backgroundColor: 'currentColor',
      opacity: 0.1,
      borderRadius: '4px',
      animation: 'pulse 1.5s ease-in-out infinite'
    }}
  />
);

// Stat card component
const StatCard = ({ label, value, subValue, icon, color, isLoading, theme: t }) => (
  <div style={{
    padding: '20px',
    backgroundColor: t.bgCard,
    borderRadius: '12px',
    border: `1px solid ${t.border}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
      <span style={{ color: t.textSecondary, fontSize: '13px' }}>{label}</span>
      <span style={{ fontSize: '20px' }}>{icon}</span>
    </div>
    {isLoading ? (
      <Skeleton height="32px" width="80px" />
    ) : (
      <>
        <div style={{ fontSize: '28px', fontWeight: '700', color: color || t.text, marginBottom: '4px' }}>
          {value}
        </div>
        {subValue && (
          <span style={{ fontSize: '12px', color: t.textSecondary }}>{subValue}</span>
        )}
      </>
    )}
  </div>
);

// Tab button component
const TabButton = ({ active, onClick, children, theme: t }) => (
  <button
    onClick={onClick}
    style={{
      padding: '10px 20px',
      backgroundColor: active ? t.primary : 'transparent',
      border: 'none',
      borderBottom: active ? 'none' : `2px solid transparent`,
      color: active ? '#fff' : t.textSecondary,
      fontSize: '14px',
      fontWeight: active ? 600 : 500,
      cursor: 'pointer',
      borderRadius: active ? '8px' : '0',
      transition: 'all 0.2s'
    }}
  >
    {children}
  </button>
);

const ReportsPage = ({ t }) => {
  const [dateRange, setDateRange] = useState({ days: 30, label: 'Last 30 days' });
  const [activeTab, setActiveTab] = useState('overview');

  // Data hooks
  const { data: reportData, isLoading: reportLoading } = useReportsDashboard({ days: dateRange.days });
  const { data: emailPerformance, isLoading: emailLoading } = useEmailPerformanceReport({ days: dateRange.days });
  const { data: currentNPS, isLoading: npsLoading } = useCurrentNPS();
  const { data: npsTrend, isLoading: trendLoading } = useNPSTrend(dateRange.days);
  const { data: recentResponses, isLoading: responsesLoading } = useRecentSurveyResponses({ limit: 50 });
  const { data: surveyRate, isLoading: rateLoading } = useSurveyResponseRate(dateRange.days);
  const { data: pipelineData, isLoading: pipelineLoading } = usePipelineReport({ days: dateRange.days });

  // Export mutation
  const exportMutation = useReportExport();

  const handleExport = async ({ reportType }) => {
    try {
      await exportMutation.mutateAsync({ reportType, options: { days: dateRange.days } });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export report: ' + error.message);
    }
  };

  // Format helpers
  const formatNumber = (num) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num?.toLocaleString() || '0';
  };

  const formatPercent = (num) => `${Math.round(num || 0)}%`;

  // Chart theme based on current theme
  const chartTheme = {
    textColor: t.textSecondary,
    gridColor: t.border,
    tooltipBg: t.bgCard
  };

  // Email performance chart lines
  const emailChartLines = [
    { key: 'opens', color: '#3b82f6', name: 'Opens' },
    { key: 'clicks', color: '#22c55e', name: 'Clicks' },
    { key: 'replies', color: '#a78bfa', name: 'Replies' }
  ];

  // NPS trend line
  const npsTrendLines = [
    { key: 'nps_score', color: npsService.getNPSColor(currentNPS?.nps_score || 0), name: 'NPS Score' }
  ];

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
            Reports & Analytics
          </h1>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            Email performance, pipeline conversions, NPS scores, and survey insights
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <DateRangeSelector value={dateRange} onChange={setDateRange} theme={t} />
          <ExportButton onExport={handleExport} isExporting={exportMutation.isPending} theme={t} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '24px',
        borderBottom: `1px solid ${t.border}`,
        paddingBottom: '4px'
      }}>
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} theme={t}>
          Overview
        </TabButton>
        <TabButton active={activeTab === 'email'} onClick={() => setActiveTab('email')} theme={t}>
          Email Performance
        </TabButton>
        <TabButton active={activeTab === 'nps'} onClick={() => setActiveTab('nps')} theme={t}>
          NPS & Surveys
        </TabButton>
        <TabButton active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} theme={t}>
          Pipeline
        </TabButton>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Key Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard
              label="NPS Score"
              value={currentNPS?.nps_score >= 0 ? `+${currentNPS?.nps_score}` : currentNPS?.nps_score}
              subValue={npsService.getNPSLabel(currentNPS?.nps_score || 0)}
              icon="📊"
              color={npsService.getNPSColor(currentNPS?.nps_score || 0)}
              isLoading={npsLoading}
              theme={t}
            />
            <StatCard
              label="Survey Responses"
              value={formatNumber(currentNPS?.total_responses)}
              subValue={`${currentNPS?.feedback_count || 0} with feedback`}
              icon="📝"
              isLoading={npsLoading}
              theme={t}
            />
            <StatCard
              label="Open Rate"
              value={formatPercent(emailPerformance?.totals?.openRate)}
              subValue={`${formatNumber(emailPerformance?.totals?.opens)} opens`}
              icon="📬"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Click Rate"
              value={formatPercent(emailPerformance?.totals?.clickRate)}
              subValue={`${formatNumber(emailPerformance?.totals?.clicks)} clicks`}
              icon="🔗"
              isLoading={emailLoading}
              theme={t}
            />
          </div>

          {/* Pipeline Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard
              label="Email Replies"
              value={formatNumber(pipelineData?.totalReplies)}
              subValue={pipelineData?.replyChange !== 0 ? `${pipelineData?.replyChange > 0 ? '+' : ''}${pipelineData?.replyChange}% vs prev` : `${dateRange.label}`}
              icon="💬"
              color="#f59e0b"
              isLoading={pipelineLoading}
              theme={t}
            />
            <StatCard
              label="Sold (Email-Driven)"
              value={formatNumber(pipelineData?.totalSold)}
              subValue={pipelineData?.totalCustomers ? `${Math.round((pipelineData.totalSold / pipelineData.totalCustomers) * 100)}% of customers` : ''}
              icon="🎯"
              color="#22c55e"
              isLoading={pipelineLoading}
              theme={t}
            />
            <StatCard
              label="Reply Rate"
              value={formatPercent(emailPerformance?.totals?.replyRate)}
              subValue={`${formatNumber(emailPerformance?.totals?.replies)} of ${formatNumber(emailPerformance?.totals?.delivered)} delivered`}
              icon="↩️"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Pipeline"
              value={formatNumber(pipelineData?.totalOpportunities)}
              subValue={`${pipelineData?.totalProspects || 0} prospects · ${pipelineData?.totalLeads || 0} leads`}
              icon="📋"
              color="#3b82f6"
              isLoading={pipelineLoading}
              theme={t}
            />
          </div>

          {/* NPS Gauge and Breakdown */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr',
            gap: '24px',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '16px', margin: 0 }}>
                Net Promoter Score
              </h3>
              {npsLoading ? (
                <Skeleton width="200px" height="150px" />
              ) : (
                <NPSGauge score={currentNPS?.nps_score || 0} size={200} theme={{ textColor: t.text, bgColor: t.border }} />
              )}
            </div>

            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: 0 }}>
                Response Breakdown
              </h3>
              {npsLoading ? (
                <Skeleton height="40px" />
              ) : (
                <NPSBreakdownBar data={currentNPS} height={48} theme={{ textColor: t.text }} />
              )}
            </div>
          </div>

          {/* Email Performance Chart */}
          <div style={{
            padding: '24px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: 0 }}>
              Email Engagement Over Time
            </h3>
            {emailLoading ? (
              <Skeleton height="300px" />
            ) : (
              <LineChart
                data={emailPerformance?.timeSeries || []}
                lines={emailChartLines}
                xKey="date"
                height={300}
                theme={chartTheme}
              />
            )}
          </div>
        </div>
      )}

      {/* Email Performance Tab */}
      {activeTab === 'email' && (
        <div>
          {/* Totals Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard
              label="Emails Sent"
              value={formatNumber(emailPerformance?.totals?.sent)}
              icon="📤"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Delivered"
              value={formatNumber(emailPerformance?.totals?.delivered)}
              icon="✅"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Opened"
              value={formatNumber(emailPerformance?.totals?.opens)}
              subValue={formatPercent(emailPerformance?.totals?.openRate)}
              icon="📬"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Clicked"
              value={formatNumber(emailPerformance?.totals?.clicks)}
              subValue={formatPercent(emailPerformance?.totals?.clickRate)}
              icon="🔗"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Replied"
              value={formatNumber(emailPerformance?.totals?.replies)}
              subValue={formatPercent(emailPerformance?.totals?.replyRate)}
              icon="↩️"
              isLoading={emailLoading}
              theme={t}
            />
            <StatCard
              label="Bounced"
              value={formatNumber(emailPerformance?.totals?.bounces)}
              icon="❌"
              color={emailPerformance?.totals?.bounces > 0 ? t.danger : undefined}
              isLoading={emailLoading}
              theme={t}
            />
          </div>

          {/* Conversion Funnel */}
          <div style={{
            padding: '24px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: 0 }}>
              Conversion Funnel
            </h3>
            {emailLoading ? (
              <Skeleton height="60px" />
            ) : (() => {
              const totals = emailPerformance?.totals || {};
              const steps = [
                { label: 'Sent', value: totals.sent || 0, color: '#6366f1' },
                { label: 'Delivered', value: totals.delivered || 0, color: '#3b82f6' },
                { label: 'Opened', value: totals.opens || 0, color: '#0ea5e9' },
                { label: 'Clicked', value: totals.clicks || 0, color: '#22c55e' },
                { label: 'Replied', value: totals.replies || 0, color: '#f59e0b' }
              ];
              const maxVal = steps[0].value || 1;
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
                  {steps.map((step, i) => {
                    const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
                    const rate = i > 0 && steps[i - 1].value > 0
                      ? Math.round((step.value / steps[i - 1].value) * 100)
                      : 100;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: step.color }}>
                          {formatNumber(step.value)}
                        </span>
                        <div style={{
                          width: '100%',
                          height: `${Math.max(pct, 4)}%`,
                          backgroundColor: step.color,
                          borderRadius: '4px 4px 0 0',
                          minHeight: '4px',
                          transition: 'height 0.5s ease'
                        }} />
                        <span style={{ fontSize: '11px', color: t.text, fontWeight: '500' }}>{step.label}</span>
                        {i > 0 && (
                          <span style={{ fontSize: '10px', color: t.textMuted }}>{rate}%</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Performance Chart */}
          <div style={{
            padding: '24px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: 0 }}>
              Daily Email Performance
            </h3>
            {emailLoading ? (
              <Skeleton height="350px" />
            ) : (
              <LineChart
                data={emailPerformance?.timeSeries || []}
                lines={[
                  { key: 'sent', color: '#6366f1', name: 'Sent' },
                  { key: 'opens', color: '#3b82f6', name: 'Opens' },
                  { key: 'clicks', color: '#22c55e', name: 'Clicks' },
                  { key: 'replies', color: '#a78bfa', name: 'Replies' }
                ]}
                xKey="date"
                height={350}
                theme={chartTheme}
              />
            )}
          </div>
        </div>
      )}

      {/* NPS & Surveys Tab */}
      {activeTab === 'nps' && (
        <div>
          {/* NPS Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard
              label="NPS Score"
              value={currentNPS?.nps_score >= 0 ? `+${currentNPS?.nps_score}` : currentNPS?.nps_score}
              subValue={npsService.getNPSLabel(currentNPS?.nps_score || 0)}
              icon="📊"
              color={npsService.getNPSColor(currentNPS?.nps_score || 0)}
              isLoading={npsLoading}
              theme={t}
            />
            <StatCard
              label="Total Responses"
              value={formatNumber(currentNPS?.total_responses)}
              icon="📝"
              isLoading={npsLoading}
              theme={t}
            />
            <StatCard
              label="Avg Rating"
              value={currentNPS?.avg_rating?.toFixed(1) || '0'}
              subValue="out of 5 stars"
              icon="⭐"
              isLoading={npsLoading}
              theme={t}
            />
            <StatCard
              label="With Feedback"
              value={formatNumber(currentNPS?.feedback_count)}
              subValue={currentNPS?.total_responses > 0
                ? `${Math.round((currentNPS.feedback_count / currentNPS.total_responses) * 100)}% of responses`
                : ''}
              icon="💬"
              isLoading={npsLoading}
              theme={t}
            />
            <StatCard
              label="Response Rate"
              value={formatPercent(surveyRate?.response_rate)}
              subValue={`${surveyRate?.surveys_completed || 0} of ${surveyRate?.surveys_sent || 0}`}
              icon="📈"
              isLoading={rateLoading}
              theme={t}
            />
          </div>

          {/* NPS Trend Chart */}
          <div style={{
            padding: '24px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`,
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: 0 }}>
              NPS Trend Over Time
            </h3>
            {trendLoading ? (
              <Skeleton height="300px" />
            ) : npsTrend && npsTrend.length > 0 ? (
              <LineChart
                data={npsTrend}
                lines={npsTrendLines}
                xKey="stat_date"
                height={300}
                yAxisLabel="NPS Score"
                theme={chartTheme}
              />
            ) : (
              <div style={{
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: t.textMuted
              }}>
                No historical NPS data available yet. Data will appear as daily aggregations are collected.
              </div>
            )}
          </div>

          {/* Recent Feedback */}
          <div style={{
            padding: '24px',
            backgroundColor: t.bgCard,
            borderRadius: '12px',
            border: `1px solid ${t.border}`
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: 0 }}>
              Recent Survey Responses
            </h3>
            <RecentFeedback responses={recentResponses || []} isLoading={responsesLoading} theme={t} />
          </div>
        </div>
      )}

      {/* Pipeline Tab */}
      {activeTab === 'pipeline' && (
        <div>
          {/* Pipeline Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard
              label="Email Replies"
              value={formatNumber(pipelineData?.totalReplies)}
              subValue={pipelineData?.replyChange !== 0 ? `${pipelineData?.replyChange > 0 ? '+' : ''}${pipelineData?.replyChange}% vs prev` : undefined}
              icon="💬"
              color="#f59e0b"
              isLoading={pipelineLoading}
              theme={t}
            />
            <StatCard
              label="Accounts Replied"
              value={formatNumber(pipelineData?.uniqueAccountsReplied)}
              subValue="unique accounts"
              icon="👤"
              color="#8b5cf6"
              isLoading={pipelineLoading}
              theme={t}
            />
            <StatCard
              label="Quote Opportunities"
              value={formatNumber(pipelineData?.totalOpportunities)}
              subValue={`${pipelineData?.totalProspects || 0} prospects, ${pipelineData?.totalLeads || 0} leads`}
              icon="📋"
              color="#3b82f6"
              isLoading={pipelineLoading}
              theme={t}
            />
            <StatCard
              label="Sold (Email-Driven)"
              value={formatNumber(pipelineData?.totalSold)}
              subValue={`of ${pipelineData?.totalCustomers || 0} customers`}
              icon="🎯"
              color="#22c55e"
              isLoading={pipelineLoading}
              theme={t}
            />
            <StatCard
              label="Prior Customers"
              value={formatNumber(pipelineData?.totalPriorCustomers)}
              subValue="win-back opportunity"
              icon="🔄"
              color="#ef4444"
              isLoading={pipelineLoading}
              theme={t}
            />
          </div>

          {/* Account Status Breakdown + Reply Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }}>
            {/* Account Status Breakdown */}
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: '0 0 20px 0' }}>
                Account Breakdown
              </h3>
              {pipelineLoading ? (
                <Skeleton height="200px" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { label: 'Customers', count: pipelineData?.statusCounts?.customer || 0, color: '#22c55e', bg: '#dcfce7' },
                    { label: 'Prospects', count: pipelineData?.statusCounts?.prospect || 0, color: '#3b82f6', bg: '#dbeafe' },
                    { label: 'Leads', count: pipelineData?.statusCounts?.lead || 0, color: '#f59e0b', bg: '#fef3c7' },
                    { label: 'Prior Customers', count: pipelineData?.statusCounts?.prior_customer || 0, color: '#ef4444', bg: '#fee2e2' }
                  ].map((item, i) => {
                    const pct = pipelineData?.totalAccounts > 0
                      ? Math.round((item.count / pipelineData.totalAccounts) * 100) : 0;
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', color: t.text, fontWeight: '500' }}>{item.label}</span>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: item.color }}>{item.count}</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: t.bgHover, borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            backgroundColor: item.color,
                            borderRadius: '4px',
                            transition: 'width 0.5s ease'
                          }} />
                        </div>
                        <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>{pct}%</div>
                      </div>
                    );
                  })}
                  <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    backgroundColor: t.bgHover,
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: t.text }}>{formatNumber(pipelineData?.totalAccounts)}</div>
                    <div style={{ fontSize: '11px', color: t.textMuted }}>Total Accounts</div>
                  </div>
                </div>
              )}
            </div>

            {/* Reply Trend Chart */}
            <div style={{
              padding: '24px',
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '20px', margin: '0 0 20px 0' }}>
                Email Replies Over Time
              </h3>
              {pipelineLoading ? (
                <Skeleton height="300px" />
              ) : pipelineData?.replyTimeSeries?.length > 0 ? (
                <LineChart
                  data={pipelineData.replyTimeSeries}
                  lines={[{ key: 'replies', color: '#f59e0b', name: 'Replies' }]}
                  xKey="date"
                  height={300}
                  theme={chartTheme}
                />
              ) : (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted }}>
                  No reply data for this period
                </div>
              )}
            </div>
          </div>

          {/* Recent Replies + Sold Accounts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Recent Replies */}
            <div style={{
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${t.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: t.text }}>Recent Replies</h3>
                <span style={{ fontSize: '12px', color: t.textMuted }}>{pipelineData?.totalReplies || 0} total</span>
              </div>
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {pipelineLoading ? (
                  <div style={{ padding: '20px' }}>
                    {[...Array(5)].map((_, i) => <Skeleton key={i} height="44px" />)}
                  </div>
                ) : !pipelineData?.recentReplies?.length ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: t.textMuted }}>No replies yet</div>
                ) : (
                  pipelineData.recentReplies.map((reply, i) => (
                    <div key={i} style={{
                      padding: '12px 20px',
                      borderBottom: `1px solid ${t.borderLight || t.border}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: t.text }}>{reply.accountName}</span>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: reply.accountStatus?.toLowerCase() === 'customer' ? '#dcfce7' :
                            reply.accountStatus?.toLowerCase() === 'prospect' ? '#dbeafe' : '#f3f4f6',
                          color: reply.accountStatus?.toLowerCase() === 'customer' ? '#166534' :
                            reply.accountStatus?.toLowerCase() === 'prospect' ? '#1e40af' : '#6b7280',
                          fontWeight: '500',
                          textTransform: 'capitalize'
                        }}>
                          {reply.accountStatus}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: t.textMuted }}>
                        Re: {reply.subject || 'No subject'}
                      </div>
                      <div style={{ fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>
                        {reply.repliedAt ? new Date(reply.repliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Sold Accounts */}
            <div style={{
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${t.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: t.text }}>Sold Accounts</h3>
                <span style={{ fontSize: '12px', color: t.textMuted }}>Emailed → Customer</span>
              </div>
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {pipelineLoading ? (
                  <div style={{ padding: '20px' }}>
                    {[...Array(5)].map((_, i) => <Skeleton key={i} height="44px" />)}
                  </div>
                ) : !pipelineData?.recentSold?.length ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: t.textMuted }}>No email-driven conversions yet</div>
                ) : (
                  pipelineData.recentSold.map((item, i) => (
                    <div key={i} style={{
                      padding: '12px 20px',
                      borderBottom: `1px solid ${t.borderLight || t.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>
                          {item.name}
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            fontWeight: '500'
                          }}>
                            Sold
                          </span>
                        </div>
                        {item.email && (
                          <div style={{ fontSize: '11px', color: t.textMuted }}>{item.email}</div>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: t.textMuted }}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
