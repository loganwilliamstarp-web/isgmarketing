// src/components/timeline/TimelineCard.jsx
import React, { useState } from 'react';
import TimelineFlow from './TimelineFlow';

const TimelineCard = ({ automation, templates, templateMap, t, expanded, onToggle }) => {
  const [showTemplatePreview, setShowTemplatePreview] = useState(null);

  // Get category color
  const categoryColors = {
    'Onboarding': '#8b5cf6',
    'Retention': '#3b82f6',
    'Cross-Sell': '#22c55e',
    'Win-Back': '#f59e0b',
    'Engagement': '#ec4899',
  };
  const categoryColor = categoryColors[automation.category] || '#71717a';

  // Line of business badge colors
  const lobColors = {
    'Personal': '#3b82f6',
    'Commercial': '#f59e0b',
    'All': '#71717a'
  };

  // Format timing display
  const getTimingDisplay = () => {
    const { timing } = automation;
    if (!timing) return null;

    const parts = [];
    if (timing.triggerDay) {
      parts.push(`Day ${timing.triggerDay}`);
    }
    if (timing.emailCount > 0) {
      parts.push(`${timing.emailCount} email${timing.emailCount > 1 ? 's' : ''}`);
    }
    if (timing.totalDays > 0) {
      parts.push(`${timing.totalDays} day${timing.totalDays > 1 ? 's' : ''} total`);
    }
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  // Get entry criteria summary
  const getEntryCriteriaSummary = () => {
    const filterConfig = automation.filter_config;
    if (!filterConfig?.groups?.length) return 'No entry criteria defined';

    const conditions = [];
    filterConfig.groups.forEach(group => {
      (group.rules || group.conditions || []).forEach(rule => {
        if (rule.field && rule.operator) {
          let text = formatCondition(rule);
          if (text) conditions.push(text);
        }
      });
    });

    return conditions.length > 0
      ? conditions.slice(0, 3).join(', ') + (conditions.length > 3 ? '...' : '')
      : 'Custom criteria';
  };

  // Format a single condition for display
  const formatCondition = (rule) => {
    const fieldLabels = {
      'account_type': 'Account Type',
      'policy_class': 'Policy Class',
      'policy_status': 'Policy Status',
      'policy_expiration_date': 'Expiration',
      'customer_since': 'Customer Since',
      'policy_term': 'Term',
      'account_status': 'Status',
      'has_policy_type': 'Has Policy',
      'active_policy_type': 'Active Policy'
    };

    const operatorLabels = {
      'equals': '=',
      'equals_days_ago': 'days ago',
      'equals_days_from_now': 'days from now',
      'is': 'is',
      'is_not': 'is not',
      'in': 'in',
      'is_blank': 'is blank'
    };

    const field = fieldLabels[rule.field] || rule.field;
    const op = operatorLabels[rule.operator] || rule.operator;
    const value = Array.isArray(rule.value) ? rule.value.join(', ') : rule.value;

    if (rule.operator === 'equals_days_ago' || rule.operator === 'equals_days_from_now') {
      return `${field} ${value} ${op}`;
    }
    return `${field} ${op} ${value || ''}`.trim();
  };

  const timingDisplay = getTimingDisplay();

  return (
    <div
      style={{
        backgroundColor: t.bgCard,
        border: `1px solid ${expanded ? categoryColor : t.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        boxShadow: expanded ? `0 4px 12px ${categoryColor}20` : 'none'
      }}
    >
      {/* Card Header - Always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          borderBottom: expanded ? `1px solid ${t.border}` : 'none'
        }}
      >
        {/* Category indicator */}
        <div
          style={{
            width: '4px',
            height: '100%',
            minHeight: '48px',
            backgroundColor: categoryColor,
            borderRadius: '2px',
            flexShrink: 0
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: '600',
              color: t.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {automation.name}
            </h3>

            {/* Line of Business badge */}
            <span style={{
              padding: '2px 6px',
              backgroundColor: `${lobColors[automation.lineOfBusiness]}20`,
              color: lobColors[automation.lineOfBusiness],
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '600',
              textTransform: 'uppercase',
              flexShrink: 0
            }}>
              {automation.lineOfBusiness}
            </span>
          </div>

          {/* Description */}
          {automation.description && (
            <p style={{
              margin: '0 0 8px 0',
              fontSize: '13px',
              color: t.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: expanded ? 'normal' : 'nowrap'
            }}>
              {automation.description}
            </p>
          )}

          {/* Timing info */}
          {timingDisplay && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: t.textMuted
            }}>
              <span style={{ opacity: 0.7 }}>⏱</span>
              {timingDisplay}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        <div style={{
          color: t.textMuted,
          fontSize: '16px',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          flexShrink: 0
        }}>
          ▼
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ padding: '16px' }}>
          {/* Entry Criteria Section */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{
              margin: '0 0 8px 0',
              fontSize: '12px',
              fontWeight: '600',
              color: t.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Entry Criteria
            </h4>
            <div style={{
              padding: '12px',
              backgroundColor: t.bgHover,
              borderRadius: '8px',
              fontSize: '13px',
              color: t.text
            }}>
              {getEntryCriteriaSummary()}
            </div>
          </div>

          {/* Workflow Visualization */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{
              margin: '0 0 12px 0',
              fontSize: '12px',
              fontWeight: '600',
              color: t.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Workflow
            </h4>
            <TimelineFlow
              nodes={automation.nodes || []}
              templateMap={templateMap}
              t={t}
              onTemplateClick={(key) => setShowTemplatePreview(key)}
            />
          </div>

          {/* Templates Used */}
          {automation.templates?.length > 0 && (
            <div>
              <h4 style={{
                margin: '0 0 8px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: t.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Templates Used ({automation.templates.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {automation.templates.map(template => (
                  <div
                    key={template.default_key}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: t.bgHover,
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>📧</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: '500',
                        color: t.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {template.name}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: t.textMuted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {template.subject}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 6px',
                      backgroundColor: `${categoryColor}20`,
                      color: categoryColor,
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '600'
                    }}>
                      {template.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template Preview Modal */}
          {showTemplatePreview && templateMap[showTemplatePreview] && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '20px'
              }}
              onClick={() => setShowTemplatePreview(null)}
            >
              <div
                style={{
                  backgroundColor: t.bgCard,
                  borderRadius: '12px',
                  maxWidth: '600px',
                  maxHeight: '80vh',
                  overflow: 'auto',
                  padding: '24px'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}>
                  <h3 style={{ margin: 0, color: t.text }}>
                    {templateMap[showTemplatePreview].name}
                  </h3>
                  <button
                    onClick={() => setShowTemplatePreview(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: t.textMuted,
                      cursor: 'pointer',
                      fontSize: '20px'
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{
                  padding: '12px',
                  backgroundColor: t.bgHover,
                  borderRadius: '8px',
                  marginBottom: '12px'
                }}>
                  <strong style={{ color: t.text }}>Subject:</strong>
                  <span style={{ color: t.textSecondary, marginLeft: '8px' }}>
                    {templateMap[showTemplatePreview].subject}
                  </span>
                </div>
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    color: '#333',
                    fontSize: '14px',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: templateMap[showTemplatePreview].body_html
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TimelineCard;
