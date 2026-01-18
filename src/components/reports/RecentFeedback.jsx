// src/components/reports/RecentFeedback.jsx
// List of recent survey responses with feedback text

import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

/**
 * Recent Feedback Component
 * @param {Object} props
 * @param {Array} props.responses - Array of survey responses
 * @param {boolean} props.isLoading - Loading state
 */
export function RecentFeedback({ responses = [], isLoading = false, theme = {} }) {
  const { userId } = useParams();
  const [filter, setFilter] = useState('all'); // 'all', 'promoter', 'passive', 'detractor'

  const {
    bgCard = '#ffffff',
    bg = '#f9fafb',
    bgHover = '#f3f4f6',
    border = '#e5e7eb',
    text = '#1f2937',
    textSecondary = '#6b7280',
    textMuted = '#9ca3af'
  } = theme;

  const categoryColors = {
    promoter: '#22c55e',
    passive: '#f59e0b',
    detractor: '#ef4444'
  };

  const categoryStars = {
    promoter: '4-5',
    passive: '3',
    detractor: '1-2'
  };

  const filteredResponses = filter === 'all'
    ? responses
    : responses.filter(r => r.category === filter);

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} style={{ color: i < rating ? '#fbbf24' : '#e5e7eb', fontSize: 14 }}>
        ★
      </span>
    ));
  };

  if (isLoading) {
    return (
      <div style={{ padding: 20 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            padding: 14,
            backgroundColor: bg,
            borderRadius: 8,
            marginBottom: 12,
            border: `1px solid ${border}`
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 80, height: 14, backgroundColor: border, borderRadius: 4 }} />
              <div style={{ width: 100, height: 14, backgroundColor: border, borderRadius: 4 }} />
            </div>
            <div style={{ width: '60%', height: 16, backgroundColor: border, borderRadius: 4, marginBottom: 8 }} />
            <div style={{ width: '80%', height: 12, backgroundColor: border, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        borderBottom: `1px solid ${border}`,
        paddingBottom: 12
      }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'promoter', label: 'Promoters', color: categoryColors.promoter },
          { key: 'passive', label: 'Passives', color: categoryColors.passive },
          { key: 'detractor', label: 'Detractors', color: categoryColors.detractor }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 12px',
              backgroundColor: filter === tab.key ? (tab.color || text) : 'transparent',
              border: `1px solid ${filter === tab.key ? (tab.color || text) : border}`,
              borderRadius: 6,
              color: filter === tab.key ? '#fff' : textSecondary,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: 6,
              padding: '2px 6px',
              backgroundColor: filter === tab.key ? 'rgba(255,255,255,0.2)' : bgHover,
              borderRadius: 4,
              fontSize: 11
            }}>
              {tab.key === 'all'
                ? responses.length
                : responses.filter(r => r.category === tab.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Responses list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
        {filteredResponses.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            color: textMuted,
            fontSize: 14
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            No survey responses {filter !== 'all' ? 'in this category' : 'yet'}
          </div>
        ) : (
          filteredResponses.map((response, index) => (
            <div
              key={response.account_unique_id || index}
              style={{
                padding: 14,
                backgroundColor: bg,
                borderRadius: 8,
                border: `1px solid ${border}`,
                borderLeft: `4px solid ${categoryColors[response.category]}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {renderStars(response.survey_stars)}
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: categoryColors[response.category],
                      borderRadius: 4,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {response.category}
                    </span>
                  </div>
                  <Link
                    to={`/${userId}/clients/${response.account_unique_id}`}
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: text,
                      textDecoration: 'none'
                    }}
                  >
                    {response.name || 'Unknown'}
                  </Link>
                  <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                    {response.person_email}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>
                  {response.survey_completed_at && new Date(response.survey_completed_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>

              {response.survey_feedback_text && (
                <div style={{
                  marginTop: 10,
                  padding: 10,
                  backgroundColor: bgCard,
                  borderRadius: 6,
                  fontSize: 13,
                  color: text,
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                  borderLeft: `2px solid ${border}`
                }}>
                  "{response.survey_feedback_text}"
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default RecentFeedback;
