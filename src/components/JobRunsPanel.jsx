// src/components/JobRunsPanel.jsx
// Master-admin panel showing background-job health: one status card per job
// (latest run + 24h failure count) and an expandable list of recent runs.
// Data comes from the job_runs table, written by the edge functions.

import React, { useState } from 'react';
import { useJobStatusSummary, useRecentJobRuns } from '../hooks/useJobRuns';

const JOB_LABELS = {
  'process-scheduled-emails': 'Email Engine',
  'sync-salesforce': 'Salesforce Sync',
  'validate-emails': 'Email Validation'
};

function formatAgo(iso) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function summaryLine(run) {
  const s = run?.summary || {};
  const parts = [];
  if (s.sent != null) parts.push(`${s.sent} sent`);
  if (s.newScheduled != null && s.newScheduled > 0) parts.push(`${s.newScheduled} scheduled`);
  if (s.cancelled != null && s.cancelled > 0) parts.push(`${s.cancelled} cancelled`);
  if (s.failed != null && s.failed > 0) parts.push(`${s.failed} failed`);
  if (s.processed != null) parts.push(`${s.processed} validated`);
  if (s.objects) {
    const total = Object.values(s.objects).reduce((a, b) => a + (Number(b) || 0), 0);
    parts.push(`${total} records`);
  }
  return parts.join(' · ') || '—';
}

const JobRunsPanel = ({ theme: t }) => {
  const [expanded, setExpanded] = useState(false);
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useJobStatusSummary();
  const { data: recentRuns, isLoading: runsLoading } = useRecentJobRuns(30);

  return (
    <div style={{
      backgroundColor: t.bgCard,
      borderRadius: '16px',
      border: `1px solid ${t.border}`,
      padding: '24px',
      marginBottom: '24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: t.text }}>
          Background Jobs (24h)
        </h3>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'none',
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '12px',
            color: t.textSecondary,
            cursor: 'pointer'
          }}
        >
          {expanded ? 'Hide runs' : 'Show recent runs'}
        </button>
      </div>

      {summaryError && (
        <div style={{ fontSize: '13px', color: '#991b1b' }}>
          Could not load job runs — has the job_runs migration been applied?
        </div>
      )}

      {summaryLoading && !summaryError && (
        <div style={{ fontSize: '13px', color: t.textMuted }}>Loading…</div>
      )}

      {!summaryLoading && !summaryError && (summary || []).length === 0 && (
        <div style={{ fontSize: '13px', color: t.textMuted }}>
          No job runs recorded in the last 24 hours.
        </div>
      )}

      {(summary || []).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {summary.map((job) => {
            const healthy = job.failures === 0 && job.latest?.success;
            return (
              <div key={job.jobName} style={{ padding: '14px', backgroundColor: t.bgHover, borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: healthy ? '#22c55e' : '#ef4444',
                    display: 'inline-block'
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: '600', color: t.text }}>
                    {JOB_LABELS[job.jobName] || job.jobName}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: t.textSecondary, marginBottom: '2px' }}>
                  Last run {formatAgo(job.latest?.started_at)} · {formatDuration(job.latest?.duration_ms)}
                </div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '2px' }}>
                  {summaryLine(job.latest)}
                </div>
                <div style={{ fontSize: '11px', color: job.failures > 0 ? '#ef4444' : t.textMuted }}>
                  {job.runs} run{job.runs === 1 ? '' : 's'}, {job.failures} failure{job.failures === 1 ? '' : 's'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '16px', overflowX: 'auto' }}>
          {runsLoading ? (
            <div style={{ fontSize: '13px', color: t.textMuted }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Job', 'Action', 'Started', 'Duration', 'Result', 'Summary'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px', color: t.textMuted,
                      borderBottom: `1px solid ${t.border}`, fontWeight: '600',
                      textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.5px'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(recentRuns || []).map((run) => (
                  <tr key={run.id}>
                    <td style={{ padding: '8px', color: t.text, whiteSpace: 'nowrap' }}>
                      {JOB_LABELS[run.job_name] || run.job_name}
                    </td>
                    <td style={{ padding: '8px', color: t.textSecondary }}>{run.action || '—'}</td>
                    <td style={{ padding: '8px', color: t.textSecondary, whiteSpace: 'nowrap' }}>{formatAgo(run.started_at)}</td>
                    <td style={{ padding: '8px', color: t.textSecondary }}>{formatDuration(run.duration_ms)}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: run.success ? '#dcfce7' : '#fee2e2',
                        color: run.success ? '#166534' : '#991b1b'
                      }}>
                        {run.success ? 'OK' : `${run.error_count} error${run.error_count === 1 ? '' : 's'}`}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: t.textMuted }}>
                      {summaryLine(run)}
                      {!run.success && run.errors?.length > 0 && (
                        <div style={{ color: '#991b1b', marginTop: '2px', maxWidth: '480px' }}>
                          {run.errors[0]}{run.errors.length > 1 ? ` (+${run.errors.length - 1} more)` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default JobRunsPanel;
