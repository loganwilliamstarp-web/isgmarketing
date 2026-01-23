// src/pages/TimelinePage.jsx
import React, { useState, useMemo } from 'react';
import { useLifecycleStages } from '../hooks/useTimeline';

// Loading skeleton component
const Skeleton = ({ width = '100%', height = '20px', style = {} }) => (
  <div
    style={{
      width,
      height,
      backgroundColor: 'currentColor',
      opacity: 0.1,
      borderRadius: '4px',
      ...style
    }}
  />
);

// Node type configurations
const nodeTypes = {
  entry_criteria: { icon: '🎯', color: '#8b5cf6', label: 'Entry Criteria' },
  trigger: { icon: '⚡', color: '#3b82f6', label: 'Trigger' },
  send_email: { icon: '📧', color: '#22c55e', label: 'Send Email' },
  delay: { icon: '⏱', color: '#f59e0b', label: 'Wait' },
  condition: { icon: '🔀', color: '#a78bfa', label: 'Condition' },
  field_condition: { icon: '📋', color: '#ec4899', label: 'Field Check' },
  update_field: { icon: '✏️', color: '#06b6d4', label: 'Update Field' },
  end: { icon: '🏁', color: '#71717a', label: 'End' }
};

// Category colors
const categoryColors = {
  'Onboarding': '#8b5cf6',
  'Retention': '#3b82f6',
  'Cross-Sell': '#22c55e',
  'Win-Back': '#f59e0b',
  'Engagement': '#ec4899'
};

const TimelinePage = ({ t }) => {
  // View mode: 'single' for individual automation, 'lifecycle' for connected view
  const [viewMode, setViewMode] = useState('single');
  // Detail level: 'full' shows all nodes, 'simple' shows emails only
  const [detailLevel, setDetailLevel] = useState('full');
  // Selected automation for single view
  const [selectedAutomation, setSelectedAutomation] = useState(null);
  // Line of business filter
  const [lobFilter, setLobFilter] = useState('all');

  // Fetch lifecycle stages with automations
  const { data, isLoading, error } = useLifecycleStages();

  // Filter automations by line of business
  const filteredStages = useMemo(() => {
    if (!data?.stages) return [];

    return data.stages.map(stage => {
      let automations = stage.automations;
      if (lobFilter !== 'all') {
        automations = automations.filter(a =>
          a.lineOfBusiness === lobFilter || a.lineOfBusiness === 'All'
        );
      }
      return { ...stage, automations };
    }).filter(stage => stage.automations.length > 0);
  }, [data?.stages, lobFilter]);

  // All automations flat list for dropdown
  const allAutomations = useMemo(() => {
    return filteredStages.flatMap(stage => stage.automations);
  }, [filteredStages]);

  // Auto-select first automation if none selected
  React.useEffect(() => {
    if (!selectedAutomation && allAutomations.length > 0) {
      setSelectedAutomation(allAutomations[0]);
    }
  }, [allAutomations, selectedAutomation]);

  // Loading state
  if (isLoading) {
    return (
      <div>
        <div style={{ marginBottom: '24px' }}>
          <Skeleton width="300px" height="32px" style={{ marginBottom: '8px' }} />
          <Skeleton width="400px" height="16px" />
        </div>
        <Skeleton height="400px" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
        <h3 style={{ color: t.text, marginBottom: '8px' }}>Failed to load timeline</h3>
        <p style={{ color: t.textMuted }}>{error.message}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: t.text,
          marginBottom: '4px'
        }}>
          Customer Lifecycle Timeline
        </h1>
        <p style={{ color: t.textSecondary, fontSize: '14px' }}>
          Visualize the customer journey through your automation workflows
        </p>
      </div>

      {/* Controls Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`,
        alignItems: 'center'
      }}>
        {/* View Mode Toggle */}
        <div style={{
          display: 'flex',
          backgroundColor: t.bgHover,
          borderRadius: '8px',
          padding: '4px'
        }}>
          <button
            onClick={() => setViewMode('single')}
            style={{
              padding: '8px 16px',
              backgroundColor: viewMode === 'single' ? t.primary : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: viewMode === 'single' ? '#fff' : t.textSecondary,
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Single Automation
          </button>
          <button
            onClick={() => setViewMode('lifecycle')}
            style={{
              padding: '8px 16px',
              backgroundColor: viewMode === 'lifecycle' ? t.primary : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: viewMode === 'lifecycle' ? '#fff' : t.textSecondary,
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Full Lifecycle
          </button>
        </div>

        {/* Automation Selector (for single view) */}
        {viewMode === 'single' && (
          <select
            value={selectedAutomation?.id || ''}
            onChange={(e) => {
              const automation = allAutomations.find(a => a.id === parseInt(e.target.value));
              setSelectedAutomation(automation);
            }}
            style={{
              padding: '10px 12px',
              backgroundColor: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '250px'
            }}
          >
            {filteredStages.map(stage => (
              <optgroup key={stage.name} label={stage.name}>
                {stage.automations.map(automation => (
                  <option key={automation.id} value={automation.id}>
                    {automation.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {/* Line of Business Filter */}
        <select
          value={lobFilter}
          onChange={(e) => setLobFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Lines</option>
          <option value="Personal">Personal Lines</option>
          <option value="Commercial">Commercial Lines</option>
        </select>

        {/* Detail Level Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginLeft: 'auto'
        }}>
          <span style={{ fontSize: '13px', color: t.textSecondary }}>Detail:</span>
          <div style={{
            display: 'flex',
            backgroundColor: t.bgHover,
            borderRadius: '6px',
            padding: '2px'
          }}>
            <button
              onClick={() => setDetailLevel('simple')}
              style={{
                padding: '6px 12px',
                backgroundColor: detailLevel === 'simple' ? t.bgCard : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: detailLevel === 'simple' ? t.text : t.textMuted,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Simple
            </button>
            <button
              onClick={() => setDetailLevel('full')}
              style={{
                padding: '6px 12px',
                backgroundColor: detailLevel === 'full' ? t.bgCard : 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: detailLevel === 'full' ? t.text : t.textMuted,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Full
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'single' ? (
        <SingleAutomationView
          automation={selectedAutomation}
          templateMap={data?.templateMap}
          detailLevel={detailLevel}
          t={t}
        />
      ) : (
        <LifecycleView
          stages={filteredStages}
          templateMap={data?.templateMap}
          detailLevel={detailLevel}
          t={t}
        />
      )}
    </div>
  );
};

// ============================================
// SINGLE AUTOMATION VIEW
// ============================================
const SingleAutomationView = ({ automation, templateMap, detailLevel, t }) => {
  if (!automation) {
    return (
      <div style={{
        padding: '60px',
        textAlign: 'center',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`
      }}>
        <p style={{ color: t.textMuted }}>Select an automation to view its workflow</p>
      </div>
    );
  }

  const nodes = automation.nodes || [];
  const categoryColor = categoryColors[automation.category] || '#71717a';

  // Filter nodes based on detail level
  const displayNodes = detailLevel === 'simple'
    ? nodes.filter(n => n.type === 'send_email' || n.type === 'condition' || n.type === 'trigger')
    : nodes.filter(n => n.type !== 'entry_criteria');

  return (
    <div style={{
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      overflow: 'hidden'
    }}>
      {/* Automation Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          backgroundColor: `${categoryColor}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px'
        }}>
          {automation.category === 'Onboarding' ? '👋' :
           automation.category === 'Retention' ? '🔄' :
           automation.category === 'Cross-Sell' ? '📈' :
           automation.category === 'Win-Back' ? '🎯' : '💬'}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: t.text, fontWeight: '600' }}>
            {automation.name}
          </h2>
          {automation.description && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: t.textSecondary }}>
              {automation.description}
            </p>
          )}
        </div>
        <div style={{
          padding: '6px 12px',
          backgroundColor: `${categoryColor}20`,
          color: categoryColor,
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {automation.category}
        </div>
      </div>

      {/* Entry Criteria */}
      {detailLevel === 'full' && (
        <EntryCriteriaBox automation={automation} t={t} />
      )}

      {/* Flowchart */}
      <div style={{
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '300px'
      }}>
        <FlowchartNodes
          nodes={displayNodes}
          templateMap={templateMap}
          detailLevel={detailLevel}
          t={t}
        />
      </div>
    </div>
  );
};

// ============================================
// ENTRY CRITERIA BOX
// ============================================
const EntryCriteriaBox = ({ automation, t }) => {
  const filterConfig = automation.filter_config;
  if (!filterConfig?.groups?.length) return null;

  const formatCondition = (rule) => {
    const fieldLabels = {
      'account_type': 'Account Type',
      'policy_class': 'Policy Class',
      'policy_status': 'Policy Status',
      'policy_expiration_date': 'Expiration Date',
      'policy_effective_date': 'Effective Date',
      'customer_since': 'Customer Since',
      'policy_term': 'Policy Term',
      'account_status': 'Account Status',
      'has_policy_type': 'Has Policy Type',
      'active_policy_type': 'Active Policy Type',
      'has_only_one_of': 'Has Only One Of'
    };

    const operatorLabels = {
      'equals': 'is',
      'equals_days_ago': 'is X days ago',
      'equals_days_from_now': 'is X days from now',
      'is': 'is',
      'is_not': 'is not',
      'in': 'is one of',
      'is_blank': 'is blank',
      'more_than_days_future': '> X days from now',
      'less_than_days_future': '< X days from now'
    };

    const field = fieldLabels[rule.field] || rule.field;
    const op = operatorLabels[rule.operator] || rule.operator;
    const value = Array.isArray(rule.value) ? rule.value.join(', ') : rule.value;

    return { field, operator: op, value };
  };

  return (
    <div style={{
      margin: '0 24px',
      padding: '16px',
      backgroundColor: `${nodeTypes.entry_criteria.color}10`,
      borderRadius: '8px',
      border: `1px solid ${nodeTypes.entry_criteria.color}30`
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <span style={{ fontSize: '16px' }}>{nodeTypes.entry_criteria.icon}</span>
        <span style={{
          fontSize: '13px',
          fontWeight: '600',
          color: nodeTypes.entry_criteria.color
        }}>
          Entry Criteria
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {filterConfig.groups.map((group, gi) => (
          <React.Fragment key={gi}>
            {(group.rules || group.conditions || []).map((rule, ri) => {
              if (!rule.field) return null;
              const { field, operator, value } = formatCondition(rule);
              return (
                <div key={ri} style={{
                  padding: '6px 10px',
                  backgroundColor: t.bgCard,
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: t.text,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ fontWeight: '500' }}>{field}</span>
                  <span style={{ color: t.textMuted }}>{operator}</span>
                  <span style={{ color: nodeTypes.entry_criteria.color, fontWeight: '500' }}>{value}</span>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ============================================
// FLOWCHART NODES RENDERER
// ============================================
const FlowchartNodes = ({ nodes, templateMap, detailLevel, t, depth = 0 }) => {
  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ color: t.textMuted, fontSize: '13px' }}>
        No workflow steps defined
      </div>
    );
  }

  return (
    <>
      {nodes.map((node, index) => (
        <React.Fragment key={node.id}>
          <FlowchartNode
            node={node}
            templateMap={templateMap}
            detailLevel={detailLevel}
            t={t}
          />

          {/* Connector to next node */}
          {index < nodes.length - 1 && !node.branches && (
            <Connector t={t} />
          )}

          {/* Branches */}
          {node.branches && (
            <BranchView
              branches={node.branches}
              templateMap={templateMap}
              detailLevel={detailLevel}
              t={t}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
};

// ============================================
// SINGLE FLOWCHART NODE
// ============================================
const FlowchartNode = ({ node, templateMap, detailLevel, t }) => {
  const type = nodeTypes[node.type] || { icon: '?', color: '#71717a', label: node.type };

  // Get node content based on type
  let title = type.label;
  let subtitle = '';
  let extraInfo = null;

  if (node.type === 'send_email') {
    const templateKey = node.config?.templateKey || node.config?.template;
    const template = templateKey && templateMap?.[templateKey];
    title = template?.name || 'Send Email';
    subtitle = template?.subject || templateKey || '';
  } else if (node.type === 'delay') {
    const days = node.config?.days || 0;
    const hours = node.config?.hours || 0;
    title = 'Wait';
    if (days > 0) {
      subtitle = `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      subtitle = `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  } else if (node.type === 'condition') {
    title = node.config?.type === 'email_opened' ? 'Email Opened?' : 'Email Clicked?';
    subtitle = 'Check engagement';
  } else if (node.type === 'trigger') {
    const time = node.config?.time || '09:00';
    const frequency = node.config?.frequency || 'Daily';
    title = 'Trigger';
    subtitle = `${frequency} at ${time}`;
  } else if (node.type === 'field_condition') {
    title = 'Check Field';
    subtitle = node.config?.field || '';
  } else if (node.type === 'update_field') {
    title = 'Update Field';
    subtitle = node.config?.field || '';
  } else if (node.type === 'end') {
    title = 'End';
    subtitle = 'Automation complete';
  }

  // Simplified view for emails - just show the email
  const isSimple = detailLevel === 'simple';
  const nodeWidth = isSimple ? '200px' : '280px';

  return (
    <div style={{
      width: nodeWidth,
      padding: isSimple ? '12px 16px' : '16px 20px',
      backgroundColor: t.bgCard,
      border: `2px solid ${type.color}`,
      borderRadius: '12px',
      boxShadow: `0 4px 12px ${type.color}20`,
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }}>
      {/* Icon */}
      <div style={{
        width: isSimple ? '36px' : '44px',
        height: isSimple ? '36px' : '44px',
        borderRadius: '10px',
        backgroundColor: `${type.color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isSimple ? '18px' : '22px',
        flexShrink: 0
      }}>
        {type.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: isSimple ? '13px' : '14px',
          fontWeight: '600',
          color: t.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: '12px',
            color: t.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: '2px'
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// CONNECTOR LINE
// ============================================
const Connector = ({ t, label }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 0'
  }}>
    <div style={{
      width: '2px',
      height: label ? '12px' : '24px',
      backgroundColor: t.border
    }} />
    {label && (
      <>
        <div style={{
          fontSize: '11px',
          fontWeight: '600',
          color: label === 'YES' ? '#22c55e' : '#ef4444',
          padding: '2px 8px',
          backgroundColor: label === 'YES' ? '#22c55e20' : '#ef444420',
          borderRadius: '4px'
        }}>
          {label}
        </div>
        <div style={{
          width: '2px',
          height: '12px',
          backgroundColor: t.border
        }} />
      </>
    )}
    <div style={{
      width: 0,
      height: 0,
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderTop: `8px solid ${t.border}`
    }} />
  </div>
);

// ============================================
// BRANCH VIEW
// ============================================
const BranchView = ({ branches, templateMap, detailLevel, t }) => {
  const yesNodes = branches.yes || [];
  const noNodes = branches.no || [];

  if (yesNodes.length === 0 && noNodes.length === 0) {
    return <Connector t={t} />;
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Split connector */}
      <div style={{
        width: '2px',
        height: '16px',
        backgroundColor: t.border
      }} />

      {/* Horizontal connector line */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        width: '100%',
        maxWidth: '600px',
        position: 'relative'
      }}>
        {/* Horizontal line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '25%',
          right: '25%',
          height: '2px',
          backgroundColor: t.border
        }} />

        {/* YES Branch */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{
            width: '2px',
            height: '16px',
            backgroundColor: t.border
          }} />
          <div style={{
            fontSize: '11px',
            fontWeight: '600',
            color: '#22c55e',
            padding: '4px 12px',
            backgroundColor: '#22c55e20',
            borderRadius: '12px',
            marginBottom: '8px'
          }}>
            YES
          </div>
          {yesNodes.length > 0 ? (
            <FlowchartNodes
              nodes={yesNodes}
              templateMap={templateMap}
              detailLevel={detailLevel}
              t={t}
              depth={1}
            />
          ) : (
            <div style={{
              padding: '8px 16px',
              backgroundColor: t.bgHover,
              borderRadius: '8px',
              fontSize: '12px',
              color: t.textMuted
            }}>
              Continue...
            </div>
          )}
        </div>

        {/* NO Branch */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{
            width: '2px',
            height: '16px',
            backgroundColor: t.border
          }} />
          <div style={{
            fontSize: '11px',
            fontWeight: '600',
            color: '#ef4444',
            padding: '4px 12px',
            backgroundColor: '#ef444420',
            borderRadius: '12px',
            marginBottom: '8px'
          }}>
            NO
          </div>
          {noNodes.length > 0 ? (
            <FlowchartNodes
              nodes={noNodes}
              templateMap={templateMap}
              detailLevel={detailLevel}
              t={t}
              depth={1}
            />
          ) : (
            <div style={{
              padding: '8px 16px',
              backgroundColor: t.bgHover,
              borderRadius: '8px',
              fontSize: '12px',
              color: t.textMuted
            }}>
              Continue...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// LIFECYCLE VIEW - Shows all automations connected
// ============================================
const LifecycleView = ({ stages, templateMap, detailLevel, t }) => {
  if (stages.length === 0) {
    return (
      <div style={{
        padding: '60px',
        textAlign: 'center',
        backgroundColor: t.bgCard,
        borderRadius: '12px',
        border: `1px solid ${t.border}`
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
        <p style={{ color: t.textMuted }}>No automations found</p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      padding: '32px',
      overflowX: 'auto'
    }}>
      {/* Lifecycle Flow */}
      <div style={{
        display: 'flex',
        gap: '24px',
        minWidth: 'min-content'
      }}>
        {stages.map((stage, stageIndex) => (
          <React.Fragment key={stage.name}>
            {/* Stage Column */}
            <div style={{
              minWidth: '300px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Stage Header */}
              <div style={{
                padding: '12px 16px',
                backgroundColor: `${stage.color}15`,
                borderRadius: '12px 12px 0 0',
                borderBottom: `3px solid ${stage.color}`,
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '700',
                  color: stage.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {stage.name}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: t.textMuted,
                  marginTop: '4px'
                }}>
                  {stage.automations.length} automation{stage.automations.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Stage Automations */}
              <div style={{
                flex: 1,
                padding: '16px',
                backgroundColor: `${stage.color}05`,
                borderRadius: '0 0 12px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                {stage.automations.map((automation, autoIndex) => (
                  <LifecycleAutomationCard
                    key={automation.id}
                    automation={automation}
                    templateMap={templateMap}
                    detailLevel={detailLevel}
                    stageColor={stage.color}
                    t={t}
                  />
                ))}
              </div>
            </div>

            {/* Stage Connector Arrow */}
            {stageIndex < stages.length - 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '2px',
                    backgroundColor: t.border
                  }} />
                  <div style={{
                    fontSize: '10px',
                    color: t.textMuted,
                    whiteSpace: 'nowrap'
                  }}>
                    then
                  </div>
                  <div style={{
                    width: 0,
                    height: 0,
                    borderTop: '8px solid transparent',
                    borderBottom: '8px solid transparent',
                    borderLeft: `12px solid ${t.border}`
                  }} />
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ============================================
// LIFECYCLE AUTOMATION CARD
// ============================================
const LifecycleAutomationCard = ({ automation, templateMap, detailLevel, stageColor, t }) => {
  const [expanded, setExpanded] = useState(false);
  const nodes = automation.nodes || [];

  // Get simplified flow for preview
  const emailNodes = nodes.filter(n => n.type === 'send_email');
  const hasConditions = nodes.some(n => n.type === 'condition');

  return (
    <div style={{
      backgroundColor: t.bgCard,
      borderRadius: '10px',
      border: `1px solid ${t.border}`,
      overflow: 'hidden'
    }}>
      {/* Card Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px 14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: `${stageColor}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px'
        }}>
          {automation.lineOfBusiness === 'Personal' ? '👤' : '🏢'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '600',
            color: t.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {automation.name}
          </div>
          <div style={{
            fontSize: '11px',
            color: t.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>{emailNodes.length} email{emailNodes.length !== 1 ? 's' : ''}</span>
            {hasConditions && <span>• branches</span>}
          </div>
        </div>
        <div style={{
          color: t.textMuted,
          fontSize: '12px',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s'
        }}>
          ▼
        </div>
      </div>

      {/* Expanded Flow */}
      {expanded && (
        <div style={{
          padding: '16px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <FlowchartNodes
            nodes={detailLevel === 'simple'
              ? nodes.filter(n => n.type === 'send_email' || n.type === 'condition' || n.type === 'trigger')
              : nodes.filter(n => n.type !== 'entry_criteria')
            }
            templateMap={templateMap}
            detailLevel={detailLevel}
            t={t}
          />
        </div>
      )}
    </div>
  );
};

export default TimelinePage;
