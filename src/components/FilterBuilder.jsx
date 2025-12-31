import React, { useState, useMemo, useEffect } from 'react';

// Filter rule definitions - shared across Mass Email and Automations
export const FILTER_FIELDS = [
  { value: 'account_status', label: 'Account Status', type: 'select', options: [
    { value: 'customer', label: 'Customer' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'prior_customer', label: 'Prior Customer' },
    { value: 'lead', label: 'Lead' }
  ]},
  { value: 'policy_type', label: 'Policy Type', type: 'select', options: [
    { value: 'Auto', label: 'Auto' },
    { value: 'Home', label: 'Home' },
    { value: 'Renters', label: 'Renters' },
    { value: 'Life', label: 'Life' },
    { value: 'Umbrella', label: 'Umbrella' },
    { value: 'Commercial', label: 'Commercial' },
    { value: 'Health', label: 'Health' }
  ]},
  { value: 'active_policy_type', label: 'Has Active Policy', type: 'select', options: [
    { value: 'Auto', label: 'Auto' },
    { value: 'Home', label: 'Home' },
    { value: 'Renters', label: 'Renters' },
    { value: 'Life', label: 'Life' },
    { value: 'Umbrella', label: 'Umbrella' },
    { value: 'Commercial', label: 'Commercial' },
    { value: 'Health', label: 'Health' }
  ]},
  { value: 'policy_status', label: 'Policy Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'pending active', label: 'Pending Active' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'expired', label: 'Expired' }
  ]},
  { value: 'policy_class', label: 'Policy Class', type: 'select', options: [
    { value: 'Personal', label: 'Personal' },
    { value: 'Commercial', label: 'Commercial' }
  ]},
  { value: 'policy_count', label: 'Number of Policies', type: 'number' },
  { value: 'policy_term', label: 'Policy Term', type: 'select', options: [
    { value: '6', label: '6 Months' },
    { value: '12', label: '12 Months' }
  ]},
  { value: 'policy_effective', label: 'Policy Effective Date', type: 'date' },
  { value: 'policy_expiration', label: 'Policy Expiration', type: 'date' },
  { value: 'state', label: 'State', type: 'select', options: [
    { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
    { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
    { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
    { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
    { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
    { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
    { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
    { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
    { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
    { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
    { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
    { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
    { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
    { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
    { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
    { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
    { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
  ]},
  { value: 'city', label: 'City', type: 'text' },
  { value: 'zip_code', label: 'ZIP Code', type: 'text' },
  { value: 'email_domain', label: 'Email Domain', type: 'text' },
  { value: 'last_email_sent', label: 'Last Email Sent', type: 'date' },
  { value: 'account_created', label: 'Account Created', type: 'date' },
];

export const OPERATORS = {
  select: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'is_any', label: 'is any of' },
    { value: 'is_not_any', label: 'is not any of' },
  ],
  number: [
    { value: 'equals', label: 'equals' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
    { value: 'at_least', label: 'at least' },
    { value: 'at_most', label: 'at most' },
    { value: 'between', label: 'is between' },
  ],
  date: [
    { value: 'before', label: 'is before' },
    { value: 'after', label: 'is after' },
    { value: 'between', label: 'is between' },
    { value: 'in_next_days', label: 'is in the next' },
    { value: 'in_last_days', label: 'was in the last' },
    { value: 'more_than_days_future', label: 'is more than X days from now' },
    { value: 'less_than_days_future', label: 'is less than X days from now' },
    { value: 'more_than_days_ago', label: 'was more than X days ago' },
    { value: 'less_than_days_ago', label: 'was less than X days ago' },
  ],
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
};

// Quick filter presets
export const QUICK_FILTERS = [
  { label: 'Renewals (30 days)', filter: { field: 'policy_expiration', operator: 'in_next_days', value: '30' } },
  { label: 'Renewals (60 days)', filter: { field: 'policy_expiration', operator: 'in_next_days', value: '60' } },
  { label: 'Renewals (90 days)', filter: { field: 'policy_expiration', operator: 'in_next_days', value: '90' } },
  { label: 'New Customers (90 days)', filter: { field: 'account_created', operator: 'in_last_days', value: '90' } },
  { label: 'Active Customers', filter: { field: 'account_status', operator: 'is', value: 'customer' } },
  { label: 'Cross-Sell: Auto Only', filters: [
    { field: 'active_policy_type', operator: 'is', value: 'Auto' },
    { field: 'active_policy_type', operator: 'is_not', value: 'Home' }
  ]},
  { label: 'Cross-Sell: Home Only', filters: [
    { field: 'active_policy_type', operator: 'is', value: 'Home' },
    { field: 'active_policy_type', operator: 'is_not', value: 'Auto' }
  ]},
  { label: 'Prior Customers', filter: { field: 'account_status', operator: 'is', value: 'prior_customer' } },
  { label: 'Prospects', filter: { field: 'account_status', operator: 'is', value: 'prospect' } },
];

// Helper to get field label
export const getFieldLabel = (fieldValue) => {
  const field = FILTER_FIELDS.find(f => f.value === fieldValue);
  return field?.label || fieldValue;
};

// Helper to get operator label
export const getOperatorLabel = (fieldType, operatorValue) => {
  const operators = OPERATORS[fieldType] || [];
  const op = operators.find(o => o.value === operatorValue);
  return op?.label || operatorValue;
};

// Helper to format rule as readable text
export const formatRuleText = (rule) => {
  const field = FILTER_FIELDS.find(f => f.value === rule.field);
  if (!field) return null;

  const fieldLabel = field.label;
  const operatorLabel = getOperatorLabel(field.type, rule.operator);
  let valueLabel = rule.value;

  // For select fields, get the option label
  if (field.type === 'select' && field.options) {
    if (rule.operator === 'is_any' || rule.operator === 'is_not_any') {
      const values = (rule.value || '').split(',');
      valueLabel = values.map(v => {
        const opt = field.options.find(o => o.value === v);
        return opt?.label || v;
      }).join(', ');
    } else {
      const opt = field.options.find(o => o.value === rule.value);
      valueLabel = opt?.label || rule.value;
    }
  }

  // Handle special cases
  if (rule.operator === 'is_empty' || rule.operator === 'is_not_empty') {
    return `${fieldLabel} ${operatorLabel}`;
  }
  if (rule.operator === 'between' && rule.value2) {
    return `${fieldLabel} ${operatorLabel} ${rule.value} and ${rule.value2}`;
  }
  if (rule.operator === 'in_next_days' || rule.operator === 'in_last_days') {
    return `${fieldLabel} ${operatorLabel} ${rule.value} days`;
  }
  // New date operators with days
  if (rule.operator === 'more_than_days_future') {
    return `${fieldLabel} is more than ${rule.value} days from now`;
  }
  if (rule.operator === 'less_than_days_future') {
    return `${fieldLabel} is less than ${rule.value} days from now`;
  }
  if (rule.operator === 'more_than_days_ago') {
    return `${fieldLabel} was more than ${rule.value} days ago`;
  }
  if (rule.operator === 'less_than_days_ago') {
    return `${fieldLabel} was less than ${rule.value} days ago`;
  }

  return `${fieldLabel} ${operatorLabel} ${valueLabel}`;
};

// Single filter rule component
export const FilterRule = ({ rule, index, onUpdate, onRemove, theme: t }) => {
  const field = FILTER_FIELDS.find(f => f.value === rule.field);
  const operators = field ? OPERATORS[field.type] : [];

  const selectStyle = {
    padding: '8px 12px',
    backgroundColor: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    color: t.text,
    fontSize: '13px',
    minWidth: '140px'
  };

  const inputStyle = {
    padding: '8px 12px',
    backgroundColor: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: '6px',
    color: t.text,
    fontSize: '13px',
    width: '120px'
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px',
      backgroundColor: t.bgCard,
      borderRadius: '8px',
      border: `1px solid ${t.border}`,
      flexWrap: 'wrap'
    }}>
      {index > 0 && (
        <span style={{
          fontSize: '12px',
          color: t.primary,
          fontWeight: '600',
          padding: '4px 8px',
          backgroundColor: `${t.primary}15`,
          borderRadius: '4px'
        }}>
          AND
        </span>
      )}

      {/* Field selector */}
      <select
        value={rule.field || ''}
        onChange={(e) => onUpdate(index, { ...rule, field: e.target.value, operator: '', value: '' })}
        style={selectStyle}
      >
        <option value="">Select field...</option>
        {FILTER_FIELDS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Operator selector */}
      {rule.field && (
        <select
          value={rule.operator || ''}
          onChange={(e) => onUpdate(index, { ...rule, operator: e.target.value })}
          style={selectStyle}
        >
          <option value="">Select condition...</option>
          {operators.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      )}

      {/* Value input - varies by field type */}
      {rule.field && rule.operator && (
        <>
          {field?.type === 'select' && !['is_any', 'is_not_any'].includes(rule.operator) && (
            <select
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              style={selectStyle}
            >
              <option value="">Select value...</option>
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {field?.type === 'select' && ['is_any', 'is_not_any'].includes(rule.operator) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {field.options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    const currentValues = rule.value ? rule.value.split(',') : [];
                    const newValues = currentValues.includes(opt.value)
                      ? currentValues.filter(v => v !== opt.value)
                      : [...currentValues, opt.value];
                    onUpdate(index, { ...rule, value: newValues.join(',') });
                  }}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: (rule.value || '').split(',').includes(opt.value) ? t.primary : t.bgHover,
                    color: (rule.value || '').split(',').includes(opt.value) ? '#fff' : t.text,
                    border: `1px solid ${(rule.value || '').split(',').includes(opt.value) ? t.primary : t.border}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {field?.type === 'number' && rule.operator !== 'between' && (
            <input
              type="number"
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              placeholder="0"
              style={inputStyle}
            />
          )}

          {field?.type === 'number' && rule.operator === 'between' && (
            <>
              <input
                type="number"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                placeholder="Min"
                style={{ ...inputStyle, width: '80px' }}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>and</span>
              <input
                type="number"
                value={rule.value2 || ''}
                onChange={(e) => onUpdate(index, { ...rule, value2: e.target.value })}
                placeholder="Max"
                style={{ ...inputStyle, width: '80px' }}
              />
            </>
          )}

          {field?.type === 'date' && rule.operator === 'in_next_days' && (
            <>
              <input
                type="number"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                placeholder="30"
                style={{ ...inputStyle, width: '70px' }}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>days</span>
            </>
          )}

          {field?.type === 'date' && rule.operator === 'in_last_days' && (
            <>
              <input
                type="number"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                placeholder="30"
                style={{ ...inputStyle, width: '70px' }}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>days</span>
            </>
          )}

          {field?.type === 'date' && rule.operator === 'between' && (
            <>
              <input
                type="date"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                style={inputStyle}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>and</span>
              <input
                type="date"
                value={rule.value2 || ''}
                onChange={(e) => onUpdate(index, { ...rule, value2: e.target.value })}
                style={inputStyle}
              />
            </>
          )}

          {field?.type === 'date' && (rule.operator === 'before' || rule.operator === 'after') && (
            <input
              type="date"
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              style={inputStyle}
            />
          )}

          {field?.type === 'date' && ['more_than_days_future', 'less_than_days_future', 'more_than_days_ago', 'less_than_days_ago'].includes(rule.operator) && (
            <>
              <input
                type="number"
                value={rule.value || ''}
                onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
                placeholder="30"
                min="1"
                style={{ ...inputStyle, width: '70px' }}
              />
              <span style={{ fontSize: '13px', color: t.textSecondary }}>days</span>
            </>
          )}

          {field?.type === 'text' && !['is_empty', 'is_not_empty'].includes(rule.operator) && (
            <input
              type="text"
              value={rule.value || ''}
              onChange={(e) => onUpdate(index, { ...rule, value: e.target.value })}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              style={{ ...inputStyle, width: '160px' }}
            />
          )}
        </>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(index)}
        style={{
          marginLeft: 'auto',
          padding: '6px 10px',
          backgroundColor: 'transparent',
          border: 'none',
          color: t.textMuted,
          cursor: 'pointer',
          fontSize: '16px',
          borderRadius: '4px'
        }}
        title="Remove filter"
      >
        ×
      </button>
    </div>
  );
};

// Filter group component - contains rules with AND logic
export const FilterGroup = ({ group, groupIndex, onRemoveGroup, onDuplicateGroup, onAddRule, onUpdateRule, onRemoveRule, theme: t }) => {
  const rules = group.rules || [];

  return (
    <div style={{
      padding: '16px',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `2px solid ${t.border}`,
      position: 'relative'
    }}>
      {/* Group header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <span style={{
          fontSize: '12px',
          fontWeight: '600',
          color: t.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Group {groupIndex + 1}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onDuplicateGroup && (
            <button
              onClick={() => onDuplicateGroup(groupIndex)}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: `1px solid ${t.border}`,
                color: t.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Duplicate group"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Duplicate
            </button>
          )}
          <button
            onClick={() => onRemoveGroup(groupIndex)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: t.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              borderRadius: '4px'
            }}
            title="Remove group"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Rules within group (AND logic) */}
      {rules.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '12px',
          color: t.textMuted,
          fontSize: '13px'
        }}>
          Add filters to this group
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {rules.map((rule, ruleIndex) => (
            <FilterRule
              key={ruleIndex}
              rule={rule}
              index={ruleIndex}
              onUpdate={(idx, updatedRule) => onUpdateRule(groupIndex, idx, updatedRule)}
              onRemove={(idx) => onRemoveRule(groupIndex, idx)}
              theme={t}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => onAddRule(groupIndex)}
        style={{
          width: '100%',
          padding: '8px',
          backgroundColor: t.bgHover,
          border: `1px dashed ${t.border}`,
          borderRadius: '6px',
          color: t.primary,
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px'
        }}
      >
        <span>+</span> Add Filter to Group
      </button>
    </div>
  );
};

// Quick filters component
export const QuickFilters = ({ groups, onApplyFilter, theme: t, filters = QUICK_FILTERS }) => {
  return (
    <div style={{
      padding: '16px',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`,
      marginBottom: '16px'
    }}>
      <div style={{ fontSize: '13px', fontWeight: '500', color: t.textSecondary, marginBottom: '10px' }}>
        Quick Filters
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {filters.map((quickFilter, idx) => (
          <button
            key={idx}
            onClick={() => onApplyFilter(quickFilter)}
            style={{
              padding: '6px 12px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '16px',
              color: t.text,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = t.primary + '20';
              e.target.style.borderColor = t.primary;
              e.target.style.color = t.primary;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = t.bgHover;
              e.target.style.borderColor = t.border;
              e.target.style.color = t.text;
            }}
          >
            + {quickFilter.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// Filter summary display
export const FilterSummary = ({ groups, theme: t }) => {
  const hasFilters = groups.some(g => g.rules?.some(r => r.field && r.operator));
  if (!hasFilters) return null;

  return (
    <div style={{
      padding: '12px 16px',
      backgroundColor: t.bgHover,
      borderBottom: `1px solid ${t.border}`
    }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: t.textSecondary, marginBottom: '8px', textTransform: 'uppercase' }}>
        Active Filters
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {groups.map((group, gIdx) => (
          <React.Fragment key={gIdx}>
            {gIdx > 0 && (
              <span style={{
                padding: '4px 8px',
                backgroundColor: '#f59e0b20',
                color: '#f59e0b',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '700'
              }}>
                OR
              </span>
            )}
            {(group.rules || []).filter(r => r.field && r.operator).map((rule, rIdx) => (
              <React.Fragment key={`${gIdx}-${rIdx}`}>
                {rIdx > 0 && (
                  <span style={{ fontSize: '11px', color: t.textMuted, alignSelf: 'center' }}>AND</span>
                )}
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: `${t.primary}15`,
                  color: t.primary,
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {formatRuleText(rule)}
                </span>
              </React.Fragment>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// Main FilterBuilder component - full filter UI with groups
const FilterBuilder = ({
  filterConfig,
  setFilterConfig,
  recipientCount,
  isLoading,
  onPreviewClick,
  showQuickFilters = true,
  theme: t
}) => {
  // Support both legacy (rules array) and new (groups array) format
  const groups = filterConfig?.groups || (filterConfig?.rules?.length > 0 ? [{ rules: filterConfig.rules }] : []);
  const hasGroups = groups.length > 0;

  const addGroup = () => {
    const newGroups = [...groups, { rules: [{ field: '', operator: '', value: '' }] }];
    setFilterConfig({ ...filterConfig, groups: newGroups, rules: undefined });
  };

  const removeGroup = (groupIndex) => {
    const newGroups = groups.filter((_, i) => i !== groupIndex);
    setFilterConfig({ ...filterConfig, groups: newGroups, rules: undefined });
  };

  const duplicateGroup = (groupIndex) => {
    const groupToCopy = groups[groupIndex];
    // Deep copy the group's rules
    const copiedGroup = {
      rules: (groupToCopy.rules || []).map(rule => ({ ...rule }))
    };
    const newGroups = [...groups];
    // Insert the copy right after the original
    newGroups.splice(groupIndex + 1, 0, copiedGroup);
    setFilterConfig({ ...filterConfig, groups: newGroups, rules: undefined });
  };

  const addRuleToGroup = (groupIndex) => {
    const newGroups = [...groups];
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      rules: [...(newGroups[groupIndex].rules || []), { field: '', operator: '', value: '' }]
    };
    setFilterConfig({ ...filterConfig, groups: newGroups, rules: undefined });
  };

  const updateRuleInGroup = (groupIndex, ruleIndex, updatedRule) => {
    const newGroups = [...groups];
    const newRules = [...(newGroups[groupIndex].rules || [])];
    newRules[ruleIndex] = updatedRule;
    newGroups[groupIndex] = { ...newGroups[groupIndex], rules: newRules };
    setFilterConfig({ ...filterConfig, groups: newGroups, rules: undefined });
  };

  const removeRuleFromGroup = (groupIndex, ruleIndex) => {
    const newGroups = [...groups];
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      rules: newGroups[groupIndex].rules.filter((_, i) => i !== ruleIndex)
    };
    // Remove empty groups
    if (newGroups[groupIndex].rules.length === 0) {
      newGroups.splice(groupIndex, 1);
    }
    setFilterConfig({ ...filterConfig, groups: newGroups, rules: undefined });
  };

  const clearAllFilters = () => {
    setFilterConfig({ ...filterConfig, groups: [], rules: undefined });
  };

  const applyQuickFilter = (quickFilter) => {
    if (quickFilter.filters) {
      // Multiple filters for a group
      const newGroup = { rules: quickFilter.filters };
      setFilterConfig({ ...filterConfig, groups: [...groups, newGroup], rules: undefined });
    } else {
      // Single filter
      const newGroup = { rules: [quickFilter.filter] };
      setFilterConfig({ ...filterConfig, groups: [...groups, newGroup], rules: undefined });
    }
  };

  // Count complete (valid) filters across all groups
  const completeFiltersCount = groups.reduce((total, group) => {
    return total + (group.rules || []).filter(r => r.field && r.operator && (r.value || ['is_empty', 'is_not_empty'].includes(r.operator))).length;
  }, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: t.text, margin: 0 }}>
          Filter Recipients
        </h3>
        {hasGroups && (
          <button
            onClick={clearAllFilters}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '6px',
              color: t.textSecondary,
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Quick Filters */}
      {showQuickFilters && (
        <QuickFilters
          groups={groups}
          onApplyFilter={applyQuickFilter}
          theme={t}
        />
      )}

      {/* Filter Groups */}
      <div style={{
        padding: '16px',
        backgroundColor: t.bgHover,
        borderRadius: '12px',
        marginBottom: '16px'
      }}>
        {!hasGroups ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: t.textMuted,
            fontSize: '14px'
          }}>
            No filters applied. All matching records will be included.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
            {groups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {groupIndex > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '8px 0',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: t.border }} />
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: '#f59e0b',
                      padding: '4px 12px',
                      backgroundColor: '#f59e0b20',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '1px'
                    }}>
                      OR
                    </span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: t.border }} />
                  </div>
                )}
                <FilterGroup
                  group={group}
                  groupIndex={groupIndex}
                  onRemoveGroup={removeGroup}
                  onDuplicateGroup={duplicateGroup}
                  onAddRule={addRuleToGroup}
                  onUpdateRule={updateRuleInGroup}
                  onRemoveRule={removeRuleFromGroup}
                  theme={t}
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addGroup}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: t.bgCard,
            border: `1px dashed ${t.border}`,
            borderRadius: '8px',
            color: t.primary,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>+</span> {hasGroups ? 'Add OR Group' : 'Add Filter Group'}
        </button>
      </div>

      {/* Quick filter summary */}
      {completeFiltersCount > 0 && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: `${t.primary}10`,
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: t.text
        }}>
          <strong>{completeFiltersCount}</strong> filter{completeFiltersCount !== 1 ? 's' : ''} in <strong>{groups.length}</strong> group{groups.length !== 1 ? 's' : ''}
          {groups.length > 1 && <span style={{ color: t.textSecondary }}> (groups combined with OR)</span>}
        </div>
      )}

      {/* Recipient Count Display */}
      {recipientCount !== undefined && (
        <button
          onClick={onPreviewClick}
          disabled={isLoading || recipientCount === 0 || !onPreviewClick}
          style={{
            width: '100%',
            padding: '20px',
            backgroundColor: `${t.primary}10`,
            borderRadius: '12px',
            border: `1px solid ${t.primary}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: (isLoading || recipientCount === 0 || !onPreviewClick) ? 'default' : 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>
              Matching Recipients
            </div>
            <div style={{ fontSize: '12px', color: t.textSecondary }}>
              {recipientCount > 0 && onPreviewClick
                ? 'Click to view matching accounts'
                : 'Accounts matching your criteria'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              fontSize: '28px',
              fontWeight: '700',
              color: t.primary
            }}>
              {isLoading ? '...' : (recipientCount ?? 0).toLocaleString()}
            </div>
            {!isLoading && recipientCount > 0 && onPreviewClick && (
              <div style={{
                padding: '6px 10px',
                backgroundColor: t.primary,
                color: '#fff',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                View
              </div>
            )}
          </div>
        </button>
      )}
    </div>
  );
};

export default FilterBuilder;
