// src/pages/MasterAdminDashboardPage.jsx
// Comprehensive Master Admin Analytics Dashboard

import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { masterAdminAnalyticsService } from '../services/masterAdminAnalytics';
import {
  usePlatformOverview,
  useTopAgencies,
  useTopAutomations,
  useTopUsers,
  useRecentBounces,
  useAccountsWithReplies,
  useEmailTimeSeries,
  useAgencyBreakdown,
  useSystemHealth,
  useRecentActivity
} from '../hooks/useMasterAdminAnalytics';
import { LineChart } from '../components/charts';

// ============================================
// LOADING SKELETON
// ============================================
const Skeleton = ({ width = '100%', height = '20px', style = {} }) => (
  <div
    style={{
      width,
      height,
      backgroundColor: 'currentColor',
      opacity: 0.1,
      borderRadius: '6px',
      animation: 'pulse 1.5s ease-in-out infinite',
      ...style
    }}
  />
);

// ============================================
// STAT CARD - Large metrics display
// ============================================
const StatCard = ({ label, value, subValue, icon, color, trend, trendLabel, isLoading, large, theme: t }) => (
  <div style={{
    padding: large ? '24px' : '20px',
    backgroundColor: t.bgCard,
    borderRadius: '16px',
    border: `1px solid ${t.border}`,
    position: 'relative',
    overflow: 'hidden'
  }}>
    {/* Background gradient accent */}
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: '120px',
      height: '120px',
      background: `radial-gradient(circle at top right, ${color || t.primary}15, transparent 70%)`,
      pointerEvents: 'none'
    }} />

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
      <span style={{ color: t.textSecondary, fontSize: '13px', fontWeight: '500' }}>{label}</span>
      <span style={{ fontSize: large ? '28px' : '24px' }}>{icon}</span>
    </div>
    {isLoading ? (
      <Skeleton height={large ? '44px' : '36px'} width="100px" />
    ) : (
      <>
        <div style={{
          fontSize: large ? '36px' : '28px',
          fontWeight: '700',
          color: color || t.text,
          marginBottom: '4px',
          letterSpacing: '-0.5px'
        }}>
          {value}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {subValue && (
            <span style={{ fontSize: '12px', color: t.textSecondary }}>{subValue}</span>
          )}
          {trend !== undefined && (
            <span style={{
              fontSize: '12px',
              fontWeight: '600',
              color: trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : t.textMuted,
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}
              {Math.abs(trend)}%
              {trendLabel && <span style={{ fontWeight: '400', color: t.textMuted, marginLeft: '4px' }}>{trendLabel}</span>}
            </span>
          )}
        </div>
      </>
    )}
  </div>
);

// ============================================
// MINI STAT - Compact inline stat
// ============================================
const MiniStat = ({ label, value, color, theme: t }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '24px', fontWeight: '700', color: color || t.text }}>{value}</div>
    <div style={{ fontSize: '11px', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
  </div>
);

// ============================================
// HEALTH INDICATOR
// ============================================
const HealthIndicator = ({ score, status, theme: t }) => {
  const statusColors = {
    healthy: '#22c55e',
    warning: '#f59e0b',
    critical: '#ef4444'
  };
  const color = statusColors[status] || t.textMuted;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: `conic-gradient(${color} ${score * 3.6}deg, ${t.border} 0deg)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          backgroundColor: t.bgCard,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          fontSize: '16px',
          color: color
        }}>
          {score}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: t.text, textTransform: 'capitalize' }}>{status}</div>
        <div style={{ fontSize: '12px', color: t.textMuted }}>System Health</div>
      </div>
    </div>
  );
};

// ============================================
// LEADERBOARD TABLE
// ============================================
const LeaderboardTable = ({ title, data, columns, isLoading, emptyMessage, timeLabel = 'This Week', theme: t }) => (
  <div style={{
    backgroundColor: t.bgCard,
    borderRadius: '16px',
    border: `1px solid ${t.border}`,
    overflow: 'hidden'
  }}>
    <div style={{
      padding: '16px 20px',
      borderBottom: `1px solid ${t.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: t.text }}>{title}</h3>
      <span style={{ fontSize: '12px', color: t.textMuted }}>{timeLabel}</span>
    </div>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: t.bgHover }}>
            {columns.map((col, i) => (
              <th key={i} style={{
                padding: '12px 16px',
                textAlign: col.align || 'left',
                fontSize: '11px',
                fontWeight: '600',
                color: t.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap'
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <tr key={i}>
                {columns.map((_, j) => (
                  <td key={j} style={{ padding: '14px 16px' }}>
                    <Skeleton height="16px" width={j === 0 ? '140px' : '60px'} />
                  </td>
                ))}
              </tr>
            ))
          ) : !data || data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '32px', textAlign: 'center', color: t.textMuted }}>
                {emptyMessage || 'No data available'}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i} style={{ borderBottom: i < data.length - 1 ? `1px solid ${t.borderLight}` : 'none' }}>
                {columns.map((col, j) => (
                  <td key={j} style={{
                    padding: '14px 16px',
                    textAlign: col.align || 'left',
                    fontSize: '13px',
                    color: t.text
                  }}>
                    {col.render ? col.render(row, i, t) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// ============================================
// ACTIVITY FEED
// ============================================
const ActivityFeed = ({ data, isLoading, theme: t }) => {
  const typeIcons = {
    sent: '📤',
    opened: '👁️',
    clicked: '🔗',
    replied: '💬',
    bounced: '❌',
    failed: '⚠️'
  };

  const typeColors = {
    sent: t.primary,
    opened: '#22c55e',
    clicked: '#8b5cf6',
    replied: '#f59e0b',
    bounced: '#ef4444',
    failed: '#ef4444'
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{
      backgroundColor: t.bgCard,
      borderRadius: '16px',
      border: `1px solid ${t.border}`,
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: t.text }}>Live Activity Feed</h3>
        <div style={{
          width: '8px',
          height: '8px',
          backgroundColor: '#22c55e',
          borderRadius: '50%',
          animation: 'pulse 2s ease-in-out infinite'
        }} />
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {isLoading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} style={{ padding: '12px 20px', borderBottom: `1px solid ${t.borderLight}` }}>
              <Skeleton height="40px" />
            </div>
          ))
        ) : !data || data.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: t.textMuted }}>
            No recent activity
          </div>
        ) : (
          data.map((item, i) => (
            <div key={i} style={{
              padding: '12px 20px',
              borderBottom: i < data.length - 1 ? `1px solid ${t.borderLight}` : 'none',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: `${typeColors[item.type]}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                flexShrink: 0
              }}>
                {typeIcons[item.type]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  color: t.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{ fontWeight: '500' }}>{item.accountName || item.email}</span>
                  <span style={{ color: t.textMuted }}> - {item.type}</span>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: t.textMuted,
                  marginTop: '2px',
                  display: 'flex',
                  gap: '8px'
                }}>
                  <span>{item.agency || item.ownerName}</span>
                  <span>{formatTime(item.sentAt)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// BOUNCES ALERT CARD
// ============================================
const BouncesCard = ({ data, isLoading, theme: t }) => (
  <div style={{
    backgroundColor: data && data.length > 0 ? '#fef2f2' : t.bgCard,
    borderRadius: '16px',
    border: `1px solid ${data && data.length > 0 ? '#fecaca' : t.border}`,
    overflow: 'hidden'
  }}>
    <div style={{
      padding: '16px 20px',
      borderBottom: `1px solid ${data && data.length > 0 ? '#fecaca' : t.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <span style={{ fontSize: '18px' }}>⚠️</span>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: data && data.length > 0 ? '#991b1b' : t.text }}>
        Recent Bounces
      </h3>
    </div>
    <div style={{ padding: '16px 20px' }}>
      {isLoading ? (
        [...Array(3)].map((_, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <Skeleton height="32px" />
          </div>
        ))
      ) : !data || data.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: '#22c55e'
        }}>
          <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>✓</span>
          <span style={{ fontSize: '13px' }}>No bounces in the last 24 hours</span>
        </div>
      ) : (
        data.map((bounce, i) => (
          <div key={i} style={{
            padding: '10px 12px',
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            marginBottom: i < data.length - 1 ? '8px' : 0
          }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#111' }}>{bounce.email}</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
              {bounce.accountName} • {bounce.agency}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#991b1b',
              marginTop: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {bounce.reason}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

// ============================================
// REPLIES SUCCESS CARD
// ============================================
const RepliesCard = ({ data, isLoading, theme: t }) => (
  <div style={{
    backgroundColor: data && data.length > 0 ? '#ecfdf5' : t.bgCard,
    borderRadius: '16px',
    border: `1px solid ${data && data.length > 0 ? '#a7f3d0' : t.border}`,
    overflow: 'hidden'
  }}>
    <div style={{
      padding: '16px 20px',
      borderBottom: `1px solid ${data && data.length > 0 ? '#a7f3d0' : t.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <span style={{ fontSize: '18px' }}>💬</span>
      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: data && data.length > 0 ? '#166534' : t.text }}>
        Accounts That Replied
      </h3>
    </div>
    <div style={{ padding: '16px 20px' }}>
      {isLoading ? (
        <Skeleton height="60px" />
      ) : !data || data.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: t.textMuted
        }}>
          <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📭</span>
          <span style={{ fontSize: '13px' }}>No replies in the last 7 days</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {data.map((account, i) => (
            <span key={i} style={{
              backgroundColor: '#fff',
              border: '1px solid #a7f3d0',
              borderRadius: '20px',
              padding: '6px 12px',
              fontSize: '13px',
              color: '#166534'
            }}>
              {account.name} <strong>({account.count})</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
// ============================================
// PDF GENERATION HELPER
// ============================================
const generatePDFContent = (data) => {
  const { overview, topAgencies, topAutomations, topUsers, systemHealth, generatedAt } = data;
  const date = new Date(generatedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString();
  };

  const formatPercent = (num) => `${num || 0}%`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Master Admin Analytics Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background: #fff; }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #3b82f6; }
    .header h1 { font-size: 32px; color: #1e293b; margin-bottom: 8px; }
    .header .subtitle { color: #64748b; font-size: 14px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
    .section-title::before { content: ''; display: inline-block; width: 4px; height: 20px; background: #3b82f6; border-radius: 2px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; }
    .stat-value { font-size: 28px; font-weight: 700; color: #3b82f6; }
    .stat-value.green { color: #22c55e; }
    .stat-value.purple { color: #8b5cf6; }
    .stat-value.orange { color: #f59e0b; }
    .stat-value.red { color: #ef4444; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-change { font-size: 11px; margin-top: 4px; }
    .stat-change.positive { color: #22c55e; }
    .stat-change.negative { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
    th.right { text-align: right; }
    td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    td.right { text-align: right; }
    .rank { display: inline-block; width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 6px; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; }
    .rank.gold { background: #f59e0b; }
    .rank.silver { background: #94a3b8; }
    .rank.bronze { background: #c2410c; }
    .health-badge { display: inline-block; padding: 8px 16px; border-radius: 8px; font-weight: 600; }
    .health-badge.healthy { background: #dcfce7; color: #166534; }
    .health-badge.warning { background: #fef3c7; color: #92400e; }
    .health-badge.critical { background: #fee2e2; color: #991b1b; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px; }
    @media print {
      body { padding: 20px; }
      .stat-card { break-inside: avoid; }
      table { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Master Admin Analytics Report</h1>
    <p class="subtitle">Generated on ${date}</p>
  </div>

  <div class="section">
    <h2 class="section-title">Platform Overview</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${formatNumber(overview?.totalUsers)}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(overview?.totalAgencies)}</div>
        <div class="stat-label">Agencies</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">${formatNumber(overview?.activeAutomations)}</div>
        <div class="stat-label">Active Automations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(overview?.totalTemplates)}</div>
        <div class="stat-label">Templates</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Weekly Performance</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${formatNumber(overview?.emailsSentWeek)}</div>
        <div class="stat-label">Emails Sent</div>
        <div class="stat-change ${overview?.sentChange > 0 ? 'positive' : 'negative'}">${overview?.sentChange > 0 ? '+' : ''}${overview?.sentChange || 0}% vs last week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">${formatPercent(overview?.openRateWeek)}</div>
        <div class="stat-label">Open Rate</div>
        <div class="stat-change ${overview?.openRateChange > 0 ? 'positive' : 'negative'}">${overview?.openRateChange > 0 ? '+' : ''}${overview?.openRateChange || 0}% vs last week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">${formatPercent(overview?.clickRateWeek)}</div>
        <div class="stat-label">Click Rate</div>
        <div class="stat-change ${overview?.clickRateChange > 0 ? 'positive' : 'negative'}">${overview?.clickRateChange > 0 ? '+' : ''}${overview?.clickRateChange || 0}% vs last week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value orange">${formatPercent(overview?.responseRateWeek)}</div>
        <div class="stat-label">Response Rate</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Today's Performance</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${formatNumber(overview?.sentToday)}</div>
        <div class="stat-label">Sent Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">${formatNumber(overview?.opensToday)}</div>
        <div class="stat-label">Opens Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">${formatNumber(overview?.clicksToday)}</div>
        <div class="stat-label">Clicks Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value orange">${formatNumber(overview?.repliesToday)}</div>
        <div class="stat-label">Replies Today</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">System Health</h2>
    <p style="margin-bottom: 12px;">
      <span class="health-badge ${systemHealth?.status || 'healthy'}">
        System Status: ${(systemHealth?.status || 'healthy').charAt(0).toUpperCase() + (systemHealth?.status || 'healthy').slice(1)} (Score: ${systemHealth?.healthScore || 100})
      </span>
    </p>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${formatNumber(systemHealth?.pendingEmails)}</div>
        <div class="stat-label">Pending Emails</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatNumber(systemHealth?.sentLastHour)}</div>
        <div class="stat-label">Sent Last Hour</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${systemHealth?.failedLast24h > 10 ? 'red' : ''}">${formatNumber(systemHealth?.failedLast24h)}</div>
        <div class="stat-label">Failed (24h)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${systemHealth?.bouncedLast24h > 20 ? 'red' : ''}">${formatNumber(systemHealth?.bouncedLast24h)}</div>
        <div class="stat-label">Bounced (24h)</div>
      </div>
    </div>
  </div>

  ${topAgencies && topAgencies.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Top Agencies by Volume</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">#</th>
          <th>Agency</th>
          <th class="right">Sent</th>
          <th class="right">Open Rate</th>
        </tr>
      </thead>
      <tbody>
        ${topAgencies.map((agency, i) => `
          <tr>
            <td><span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
            <td><strong>${agency.name}</strong></td>
            <td class="right">${formatNumber(agency.sent)}</td>
            <td class="right" style="color: #22c55e; font-weight: 600;">${formatPercent(agency.openRate)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${topAutomations && topAutomations.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Top Performing Automations</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">#</th>
          <th>Automation</th>
          <th>Owner</th>
          <th class="right">Sent</th>
          <th class="right">Open Rate</th>
        </tr>
      </thead>
      <tbody>
        ${topAutomations.map((auto, i) => `
          <tr>
            <td><span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
            <td><strong>${auto.name}</strong></td>
            <td style="color: #64748b;">${auto.ownerName}</td>
            <td class="right">${formatNumber(auto.sent)}</td>
            <td class="right" style="color: #22c55e; font-weight: 600;">${formatPercent(auto.openRate)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${topUsers && topUsers.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Top Users by Volume</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">#</th>
          <th>User</th>
          <th>Agency</th>
          <th class="right">Sent</th>
          <th class="right">Open Rate</th>
        </tr>
      </thead>
      <tbody>
        ${topUsers.map((user, i) => `
          <tr>
            <td><span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
            <td><strong>${user.name}</strong></td>
            <td style="color: #64748b;">${user.agency || '-'}</td>
            <td class="right">${formatNumber(user.sent)}</td>
            <td class="right" style="color: #22c55e; font-weight: 600;">${formatPercent(user.openRate)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>ISG Marketing Platform - Master Admin Analytics Report</p>
    <p>This report was automatically generated and contains confidential information.</p>
  </div>
</body>
</html>
  `;
};

const MasterAdminDashboardPage = ({ t }) => {
  const { isAdmin, user } = useAuth();
  const [timeRange, setTimeRange] = useState(30);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // PDF Download handler
  const handleDownloadPDF = useCallback(async () => {
    setIsGeneratingPDF(true);
    try {
      const reportData = await masterAdminAnalyticsService.generateReportData();
      const htmlContent = generatePDFContent(reportData);

      // Open in new window for printing/saving as PDF
      const printWindow = window.open('', '_blank');
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Trigger print dialog after content loads
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, []);

  // Fetch all data
  const { data: overview, isLoading: overviewLoading } = usePlatformOverview();
  const { data: topAgencies, isLoading: agenciesLoading } = useTopAgencies(10);
  const { data: topAutomations, isLoading: automationsLoading } = useTopAutomations(10);
  const { data: topUsers, isLoading: usersLoading } = useTopUsers(10);
  const { data: recentBounces, isLoading: bouncesLoading } = useRecentBounces(5);
  const { data: accountsWithReplies, isLoading: repliesLoading } = useAccountsWithReplies(10);
  const { data: timeSeries, isLoading: timeSeriesLoading } = useEmailTimeSeries(timeRange);
  const { data: agencyBreakdown, isLoading: breakdownLoading } = useAgencyBreakdown();
  const { data: systemHealth, isLoading: healthLoading } = useSystemHealth();
  const { data: recentActivity, isLoading: activityLoading } = useRecentActivity(20);

  // Redirect non-admins
  if (!isAdmin) {
    return <Navigate to={`/${user?.id}/dashboard`} replace />;
  }

  // Format helpers
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const formatPercent = (num) => `${num || 0}%`;

  // Chart configuration
  const chartTheme = {
    textColor: t.textSecondary,
    gridColor: t.border,
    tooltipBg: t.bgCard
  };

  const volumeChartLines = [
    { key: 'sent', color: '#3b82f6', name: 'Sent' },
    { key: 'opens', color: '#22c55e', name: 'Opened' },
    { key: 'clicks', color: '#8b5cf6', name: 'Clicked' },
    { key: 'replies', color: '#f59e0b', name: 'Replied' }
  ];

  // Table columns
  const agencyColumns = [
    {
      header: '#',
      key: 'rank',
      render: (_, i, t) => (
        <span style={{
          width: '24px',
          height: '24px',
          backgroundColor: ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'][i] || t.bgHover,
          color: i < 5 ? '#fff' : t.text,
          borderRadius: '6px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {i + 1}
        </span>
      )
    },
    { header: 'Agency', key: 'name', render: (row) => <span style={{ fontWeight: '500' }}>{row.name}</span> },
    { header: 'Sent', key: 'sent', align: 'right', render: (row) => formatNumber(row.sent) },
    { header: 'Open Rate', key: 'openRate', align: 'right', render: (row) => <span style={{ color: '#22c55e', fontWeight: '600' }}>{formatPercent(row.openRate)}</span> }
  ];

  const automationColumns = [
    {
      header: '#',
      key: 'rank',
      render: (_, i, t) => (
        <span style={{
          width: '24px',
          height: '24px',
          backgroundColor: ['#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'][i] || t.bgHover,
          color: i < 5 ? '#fff' : t.text,
          borderRadius: '6px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {i + 1}
        </span>
      )
    },
    { header: 'Automation', key: 'name', render: (row) => <span style={{ fontWeight: '500' }}>{row.name}</span> },
    { header: 'Owner', key: 'ownerName', render: (row) => <span style={{ color: t.textMuted }}>{row.ownerName}</span> },
    { header: 'Sent', key: 'sent', align: 'right', render: (row) => formatNumber(row.sent) },
    { header: 'Open Rate', key: 'openRate', align: 'right', render: (row) => <span style={{ color: '#22c55e', fontWeight: '600' }}>{formatPercent(row.openRate)}</span> }
  ];

  const userColumns = [
    {
      header: '#',
      key: 'rank',
      render: (_, i, t) => (
        <span style={{
          width: '24px',
          height: '24px',
          backgroundColor: ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899'][i] || t.bgHover,
          color: i < 5 ? '#fff' : t.text,
          borderRadius: '6px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {i + 1}
        </span>
      )
    },
    { header: 'User', key: 'name', render: (row) => <span style={{ fontWeight: '500' }}>{row.name}</span> },
    { header: 'Agency', key: 'agency', render: (row) => <span style={{ color: t.textMuted }}>{row.agency}</span> },
    { header: 'Sent', key: 'sent', align: 'right', render: (row) => formatNumber(row.sent) },
    { header: 'Open Rate', key: 'openRate', align: 'right', render: (row) => <span style={{ color: '#22c55e', fontWeight: '600' }}>{formatPercent(row.openRate)}</span> }
  ];

  return (
    <div>
      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: t.text, margin: 0 }}>
              Master Admin Dashboard
            </h1>
            <span style={{
              padding: '4px 10px',
              backgroundColor: `${t.primary}15`,
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              color: t.primary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Admin Only
            </span>
          </div>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            Platform-wide analytics and performance metrics
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Download PDF Button */}
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              cursor: isGeneratingPDF ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isGeneratingPDF ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => !isGeneratingPDF && (e.target.style.backgroundColor = '#2563eb')}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
          >
            {isGeneratingPDF ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                Generating...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF
              </>
            )}
          </button>

          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              backgroundColor: t.bgCard,
              color: t.text,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>

          {/* System Health Badge */}
          {!healthLoading && systemHealth && (
            <div style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: systemHealth.status === 'healthy' ? '#dcfce7' :
                              systemHealth.status === 'warning' ? '#fef3c7' : '#fee2e2',
              color: systemHealth.status === 'healthy' ? '#166534' :
                     systemHealth.status === 'warning' ? '#92400e' : '#991b1b',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'currentColor'
              }} />
              System {systemHealth.status.charAt(0).toUpperCase() + systemHealth.status.slice(1)}
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats Row - Yesterday's Performance */}
      <div style={{
        backgroundColor: `linear-gradient(135deg, ${t.bgCard} 0%, ${t.bgHover} 100%)`,
        borderRadius: '20px',
        border: `1px solid ${t.border}`,
        padding: '24px',
        marginBottom: '24px',
        background: `linear-gradient(135deg, ${t.primary}08 0%, ${t.bgCard} 100%)`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
            Yesterday's Performance
          </h2>
          <span style={{ fontSize: '12px', color: t.textMuted }}>
            {new Date(Date.now() - 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px' }}>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: t.bgCard, borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>{formatNumber(overview?.emailsSentYesterday)}</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>Emails Sent</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: t.bgCard, borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#22c55e' }}>{formatNumber(overview?.opensYesterday)}</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>Opens</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: t.bgCard, borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>{formatNumber(overview?.clicksYesterday)}</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>Clicks</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: t.bgCard, borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{formatNumber(overview?.repliesYesterday)}</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>Replies</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: overview?.bouncesYesterday > 10 ? '#fef2f2' : t.bgCard, borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '32px', fontWeight: '700', color: overview?.bouncesYesterday > 10 ? '#ef4444' : t.text }}>{formatNumber(overview?.bouncesYesterday)}</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '4px' }}>Bounces</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          label="Emails This Week"
          value={formatNumber(overview?.emailsSentWeek)}
          trend={overview?.sentChange}
          trendLabel="vs last week"
          icon="📧"
          color="#3b82f6"
          isLoading={overviewLoading}
          large
          theme={t}
        />
        <StatCard
          label="Open Rate"
          value={formatPercent(overview?.openRateWeek)}
          trend={overview?.openRateChange}
          trendLabel="vs last week"
          icon="📬"
          color="#22c55e"
          isLoading={overviewLoading}
          large
          theme={t}
        />
        <StatCard
          label="Click Rate"
          value={formatPercent(overview?.clickRateWeek)}
          trend={overview?.clickRateChange}
          trendLabel="vs last week"
          icon="🔗"
          color="#8b5cf6"
          isLoading={overviewLoading}
          large
          theme={t}
        />
        <StatCard
          label="Response Rate"
          value={formatPercent(overview?.responseRateWeek)}
          subValue="replies/delivered"
          icon="💬"
          color="#f59e0b"
          isLoading={overviewLoading}
          large
          theme={t}
        />
      </div>

      {/* Platform Overview Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          label="Total Users"
          value={formatNumber(overview?.totalUsers)}
          icon="👥"
          isLoading={overviewLoading}
          theme={t}
        />
        <StatCard
          label="Agencies"
          value={formatNumber(overview?.totalAgencies)}
          icon="🏢"
          isLoading={overviewLoading}
          theme={t}
        />
        <StatCard
          label="Active Automations"
          value={formatNumber(overview?.activeAutomations)}
          icon="⚡"
          color="#22c55e"
          isLoading={overviewLoading}
          theme={t}
        />
        <StatCard
          label="Templates"
          value={formatNumber(overview?.totalTemplates)}
          icon="📝"
          isLoading={overviewLoading}
          theme={t}
        />
        <StatCard
          label="Sent Today"
          value={formatNumber(overview?.sentToday)}
          subValue={`${formatNumber(overview?.scheduledWeek)} this week`}
          icon="📅"
          color="#3b82f6"
          isLoading={overviewLoading}
          theme={t}
        />
        <StatCard
          label="Failed (24h)"
          value={formatNumber(overview?.failedEmails24h)}
          icon="⚠️"
          color={overview?.failedEmails24h > 10 ? '#ef4444' : undefined}
          isLoading={overviewLoading}
          theme={t}
        />
      </div>

      {/* Email Volume Chart */}
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        padding: '24px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
            Email Volume & Engagement
          </h3>
          <div style={{ display: 'flex', gap: '16px' }}>
            {volumeChartLines.map(line => (
              <div key={line.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '3px', backgroundColor: line.color, borderRadius: '2px' }} />
                <span style={{ fontSize: '12px', color: t.textMuted }}>{line.name}</span>
              </div>
            ))}
          </div>
        </div>
        {timeSeriesLoading ? (
          <Skeleton height="350px" />
        ) : (
          <LineChart
            data={timeSeries || []}
            lines={volumeChartLines}
            xKey="date"
            height={350}
            theme={chartTheme}
          />
        )}
      </div>

      {/* System Health & Alerts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* System Health */}
        <div style={{
          backgroundColor: t.bgCard,
          borderRadius: '16px',
          border: `1px solid ${t.border}`,
          padding: '24px'
        }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '15px', fontWeight: '600', color: t.text }}>
            System Health
          </h3>
          {healthLoading ? (
            <Skeleton height="80px" />
          ) : (
            <>
              <HealthIndicator score={systemHealth?.healthScore || 0} status={systemHealth?.status || 'unknown'} theme={t} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '20px' }}>
                <div style={{ padding: '12px', backgroundColor: t.bgHover, borderRadius: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: t.text }}>{formatNumber(systemHealth?.pendingEmails)}</div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Pending Emails</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: t.bgHover, borderRadius: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: t.text }}>{formatNumber(systemHealth?.sentLastHour)}</div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Sent Last Hour</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bounces Alert */}
        <BouncesCard data={recentBounces} isLoading={bouncesLoading} theme={t} />

        {/* Replies Success */}
        <RepliesCard data={accountsWithReplies} isLoading={repliesLoading} theme={t} />
      </div>

      {/* Leaderboards & Activity Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Top Agencies */}
        <LeaderboardTable
          title="Top Agencies by Volume"
          data={topAgencies}
          columns={agencyColumns}
          isLoading={agenciesLoading}
          emptyMessage="No agency data available"
          theme={t}
        />

        {/* Live Activity Feed */}
        <ActivityFeed data={recentActivity} isLoading={activityLoading} theme={t} />
      </div>

      {/* More Leaderboards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Top Automations */}
        <LeaderboardTable
          title="Top Performing Automations"
          data={topAutomations}
          columns={automationColumns}
          isLoading={automationsLoading}
          emptyMessage="No automation data available"
          timeLabel="Last 30 Days"
          theme={t}
        />

        {/* Top Users */}
        <LeaderboardTable
          title="Top Users by Volume"
          data={topUsers}
          columns={userColumns}
          isLoading={usersLoading}
          emptyMessage="No user data available"
          theme={t}
        />
      </div>

      {/* Agency Breakdown Table */}
      <div style={{
        backgroundColor: t.bgCard,
        borderRadius: '16px',
        border: `1px solid ${t.border}`,
        overflow: 'hidden',
        marginBottom: '24px'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: t.text }}>Agency Overview</h3>
          <span style={{ fontSize: '12px', color: t.textMuted }}>{agencyBreakdown?.length || 0} agencies</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: t.bgHover }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>Agency</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>Total Users</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>Active Users</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>Automations</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>Active Automations</th>
              </tr>
            </thead>
            <tbody>
              {breakdownLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td style={{ padding: '14px 16px' }}><Skeleton height="16px" width="140px" /></td>
                    <td style={{ padding: '14px 16px' }}><Skeleton height="16px" width="40px" /></td>
                    <td style={{ padding: '14px 16px' }}><Skeleton height="16px" width="40px" /></td>
                    <td style={{ padding: '14px 16px' }}><Skeleton height="16px" width="40px" /></td>
                    <td style={{ padding: '14px 16px' }}><Skeleton height="16px" width="40px" /></td>
                  </tr>
                ))
              ) : !agencyBreakdown || agencyBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: t.textMuted }}>
                    No agency data available
                  </td>
                </tr>
              ) : (
                agencyBreakdown.slice(0, 15).map((agency, i) => (
                  <tr key={i} style={{ borderBottom: i < agencyBreakdown.length - 1 ? `1px solid ${t.borderLight}` : 'none' }}>
                    <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '500', color: t.text }}>{agency.name}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', color: t.text }}>{agency.totalUsers}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px' }}>
                      <span style={{
                        color: agency.activeUsers > 0 ? '#22c55e' : t.textMuted,
                        fontWeight: agency.activeUsers > 0 ? '600' : '400'
                      }}>
                        {agency.activeUsers}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', color: t.text }}>{agency.totalAutomations}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px' }}>
                      <span style={{
                        color: agency.activeAutomations > 0 ? '#22c55e' : t.textMuted,
                        fontWeight: agency.activeAutomations > 0 ? '600' : '400'
                      }}>
                        {agency.activeAutomations}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Summary */}
      <div style={{
        background: `linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)`,
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600', color: '#5b21b6' }}>
          30-Day Summary
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          <div style={{ textAlign: 'center', padding: '20px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '36px', fontWeight: '700', color: '#5b21b6' }}>{formatNumber(overview?.emailsSentMonth)}</div>
                <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>Total Emails Sent</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '20px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '36px', fontWeight: '700', color: '#5b21b6' }}>{formatPercent(overview?.openRateWeek)}</div>
                <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>Avg Open Rate</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '20px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '12px' }}>
            {overviewLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '36px', fontWeight: '700', color: '#5b21b6' }}>{formatPercent(overview?.bounceRateWeek)}</div>
                <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>Bounce Rate</div>
              </>
            )}
          </div>
          <div style={{ textAlign: 'center', padding: '20px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '12px' }}>
            {healthLoading ? <Skeleton height="40px" /> : (
              <>
                <div style={{ fontSize: '36px', fontWeight: '700', color: '#5b21b6' }}>{formatNumber(systemHealth?.pendingEmails)}</div>
                <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '4px' }}>Queued Emails</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', color: t.textMuted, fontSize: '12px' }}>
        <p style={{ margin: 0 }}>
          Data refreshes automatically every minute. Last updated: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default MasterAdminDashboardPage;
