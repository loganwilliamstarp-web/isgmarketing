import React, { useState } from 'react';

// Default dark theme (fallback)
const defaultTheme = {
  bg: '#09090b',
  bgCard: '#18181b',
  bgSidebar: '#18181b',
  bgHover: '#27272a',
  bgInput: '#27272a',
  border: '#27272a',
  borderLight: '#3f3f46',
  text: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  purple: '#a78bfa',
};

// ============================================
// FILTER BUILDER COMPONENT (embedded)
// ============================================
const FilterBuilder = ({ onClose, t = defaultTheme }) => {
  const [activeTab, setActiveTab] = useState('simple');
  const [groupLogic, setGroupLogic] = useState('OR');
  const [testSearch, setTestSearch] = useState('');
  const [selectedTestAccount, setSelectedTestAccount] = useState(null);

  // Sample test accounts data
  const testAccounts = [
    {
      id: 1,
      name: 'John Smith',
      policies: 'Auto only • Expires in 52 days',
      passes: true,
      conditions: [
        { label: 'Has policy type: Auto', passes: true, value: 'Auto (Active)' },
        { label: 'Has policy type: Home', passes: true, value: 'None (Excluded)' },
        { label: 'Expiration: 45-60 days', passes: true, value: '52 days' },
      ],
      groupResults: [{ passes: true }, { passes: false }]
    },
    {
      id: 2,
      name: 'Jane Wilson',
      policies: 'Home only • Expires in 48 days',
      passes: true,
      conditions: [
        { label: 'Has policy type: Home', passes: true, value: 'Home (Active)' },
        { label: 'Has policy type: Auto', passes: true, value: 'None (Excluded)' },
        { label: 'Expiration: 45-60 days', passes: true, value: '48 days' },
      ],
      groupResults: [{ passes: false }, { passes: true }]
    },
    {
      id: 3,
      name: 'Bob Johnson',
      policies: 'Auto + Home • Expires in 55 days',
      passes: false,
      conditions: [
        { label: 'Has policy type: Auto', passes: true, value: 'Auto (Active)' },
        { label: 'Excludes: Home', passes: false, reason: 'Account has Home policy', value: 'Home (Active)' },
        { label: 'Expiration: 45-60 days', passes: true, value: '55 days' },
      ],
      groupResults: [{ passes: false }, { passes: false }]
    },
    {
      id: 4,
      name: 'Sarah Davis',
      policies: 'Auto only • Expires in 90 days',
      passes: false,
      conditions: [
        { label: 'Has policy type: Auto', passes: true, value: 'Auto (Active)' },
        { label: 'Has policy type: Home', passes: true, value: 'None (Excluded)' },
        { label: 'Expiration: 45-60 days', passes: false, reason: 'Outside timing window', value: '90 days' },
      ],
      groupResults: [{ passes: false }, { passes: false }]
    },
  ].filter(a => a.name.toLowerCase().includes(testSearch.toLowerCase()));

  const [filterGroups, setFilterGroups] = useState([
    {
      id: 1,
      name: 'Group 1',
      logic: 'AND',
      color: t.primary,
      filters: {
        include: [
          { id: 1, conditionId: 'has_policy_type', label: 'Has policy type', icon: '📋', value: 'Auto' },
        ],
        exclude: [
          { id: 2, conditionId: 'has_policy_type', label: 'Has policy type', icon: '📋', value: 'Home' },
        ],
        activity: []
      }
    },
    {
      id: 2,
      name: 'Group 2',
      logic: 'AND',
      color: t.purple,
      filters: {
        include: [
          { id: 3, conditionId: 'has_policy_type', label: 'Has policy type', icon: '📋', value: 'Home' },
        ],
        exclude: [
          { id: 4, conditionId: 'has_policy_type', label: 'Has policy type', icon: '📋', value: 'Auto' },
        ],
        activity: []
      }
    }
  ]);

  const [sharedTiming, setSharedTiming] = useState({
    enabled: true,
    field: 'expiration_days',
    min: 45,
    max: 60,
  });

  const guidedConditions = {
    'Customer Type': {
      icon: '👤',
      color: t.purple,
      conditions: [
        { id: 'customer_status', label: 'Customer status', configType: 'select', options: ['New', 'Existing', 'Prior', 'Prospect'] },
        { id: 'is_new', label: 'Is a new customer', configType: 'none' },
        { id: 'is_existing', label: 'Is an existing customer', configType: 'none' },
        { id: 'is_prior', label: 'Is a prior customer', configType: 'none' },
      ]
    },
    'Policy Bundle': {
      icon: '📦',
      color: t.primary,
      conditions: [
        { id: 'bundle_status', label: 'Bundle status', configType: 'select', options: ['Monoline', 'Bundled'] },
        { id: 'policy_count', label: 'Number of policies', configType: 'number_compare', unit: 'policies' },
      ]
    },
    'Coverage': {
      icon: '📋',
      color: t.success,
      conditions: [
        { id: 'has_policy_type', label: 'Has policy type', configType: 'select', options: ['Auto', 'Home', 'Renters', 'Umbrella', 'Life', 'Any Active'] },
        { id: 'policy_status', label: 'Policy status', configType: 'select', options: ['Active', 'Pending', 'Cancelled', 'Expired'] },
        { id: 'has_active_renewal', label: 'Has an active renewal', configType: 'none' },
      ]
    },
    'Policy Timing': {
      icon: '📅',
      color: t.warning,
      conditions: [
        { id: 'expiration_days', label: 'Expiration date', configType: 'days_from_now' },
        { id: 'effective_days', label: 'Effective date', configType: 'days_ago' },
        { id: 'approaching_renewal', label: 'Is approaching renewal', configType: 'none' },
      ]
    },
    'Email History': {
      icon: '📧',
      color: '#06b6d4',
      conditions: [
        { id: 'no_email_in', label: "Hasn't received email in", configType: 'days_threshold', defaultValue: 30 },
        { id: 'received_template', label: 'Has received email', configType: 'select', options: ['Welcome', 'Renewal', 'Cross Sell', 'Follow-Up', 'Feedback'] },
        { id: 'not_received_template', label: 'Has NOT received email', configType: 'select', options: ['Welcome', 'Renewal', 'Cross Sell', 'Follow-Up', 'Feedback'] },
      ]
    },
    'Engagement': {
      icon: '📬',
      color: '#8b5cf6',
      conditions: [
        { id: 'opened_last', label: 'Opened last email', configType: 'none' },
        { id: 'clicked_last', label: 'Clicked last email', configType: 'none' },
        { id: 'no_opens_in', label: "Hasn't opened email in", configType: 'days_threshold', defaultValue: 60 },
      ]
    },
    'Feedback': {
      icon: '⭐',
      color: '#eab308',
      conditions: [
        { id: 'feedback_score', label: 'Feedback score', configType: 'number_compare', unit: 'stars', max: 5 },
        { id: 'gave_feedback', label: 'Has given feedback', configType: 'none' },
        { id: 'no_feedback', label: 'Has not given feedback', configType: 'none' },
      ]
    }
  };

  const groupColors = ['#3b82f6', '#a78bfa', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];

  const addGroup = () => {
    const newId = Math.max(...filterGroups.map(g => g.id), 0) + 1;
    setFilterGroups([...filterGroups, {
      id: newId,
      name: `Group ${newId}`,
      logic: 'AND',
      color: groupColors[(newId - 1) % groupColors.length],
      filters: { include: [], exclude: [], activity: [] }
    }]);
  };

  const removeGroup = (groupId) => {
    if (filterGroups.length > 1) {
      setFilterGroups(filterGroups.filter(g => g.id !== groupId));
    }
  };

  const addFilterToGroup = (groupId, section, filter) => {
    setFilterGroups(filterGroups.map(g => 
      g.id === groupId 
        ? { ...g, filters: { ...g.filters, [section]: [...g.filters[section], { ...filter, id: Date.now() }] } }
        : g
    ));
  };

  const updateFilterInGroup = (groupId, section, filterId, updates) => {
    setFilterGroups(filterGroups.map(g => 
      g.id === groupId 
        ? { ...g, filters: { ...g.filters, [section]: g.filters[section].map(f => f.id === filterId ? { ...f, ...updates } : f) } }
        : g
    ));
  };

  const removeFilterFromGroup = (groupId, section, filterId) => {
    setFilterGroups(filterGroups.map(g => 
      g.id === groupId 
        ? { ...g, filters: { ...g.filters, [section]: g.filters[section].filter(f => f.id !== filterId) } }
        : g
    ));
  };

  const findConditionDef = (conditionId) => {
    for (const cat of Object.values(guidedConditions)) {
      const found = cat.conditions.find(c => c.id === conditionId);
      if (found) return found;
    }
    return null;
  };

  // Configurable Filter Pill
  const ConfigurableFilterPill = ({ filter, groupId, section, color }) => {
    const conditionDef = findConditionDef(filter.conditionId);
    
    const renderConfig = () => {
      if (!conditionDef) return null;
      
      switch (conditionDef.configType) {
        case 'select':
          return (
            <select 
              value={filter.value || conditionDef.options[0]}
              onChange={(e) => updateFilterInGroup(groupId, section, filter.id, { value: e.target.value })}
              style={{
                backgroundColor: t.bgHover,
                border: `1px solid ${t.borderLight}`,
                borderRadius: '4px',
                padding: '4px 8px',
                color: t.text,
                fontSize: '12px',
                marginLeft: '6px'
              }}
            >
              {conditionDef.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        
        case 'days_threshold':
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
              <input 
                type="number"
                value={filter.value || conditionDef.defaultValue || 30}
                onChange={(e) => updateFilterInGroup(groupId, section, filter.id, { value: e.target.value })}
                style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '4px 6px',
                  color: t.text,
                  fontSize: '12px',
                  width: '50px',
                  textAlign: 'center'
                }}
              />
              <span style={{ color: t.textMuted, fontSize: '11px' }}>days</span>
            </div>
          );

        case 'number_compare':
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
              <select
                value={filter.operator || 'at_least'}
                onChange={(e) => updateFilterInGroup(groupId, section, filter.id, { operator: e.target.value })}
                style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '4px 6px',
                  color: t.text,
                  fontSize: '11px'
                }}
              >
                <option value="equals">equals</option>
                <option value="at_least">at least</option>
                <option value="at_most">at most</option>
              </select>
              <input 
                type="number"
                value={filter.value || 1}
                max={conditionDef.max}
                onChange={(e) => updateFilterInGroup(groupId, section, filter.id, { value: e.target.value })}
                style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '4px 6px',
                  color: t.text,
                  fontSize: '12px',
                  width: '45px',
                  textAlign: 'center'
                }}
              />
              {conditionDef.unit && <span style={{ color: t.textMuted, fontSize: '11px' }}>{conditionDef.unit}</span>}
            </div>
          );

        default:
          return null;
      }
    };

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '8px 10px',
        backgroundColor: `${color}12`,
        borderRadius: '8px',
        border: `1px solid ${color}25`,
        fontSize: '13px',
        color: t.text
      }}>
        <span style={{ opacity: 0.7 }}>{filter.icon}</span>
        <span>{filter.label}</span>
        {renderConfig()}
        <button 
          onClick={() => removeFilterFromGroup(groupId, section, filter.id)}
          style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            padding: '0 2px',
            fontSize: '16px',
            lineHeight: 1,
            marginLeft: 'auto'
          }}
        >×</button>
      </div>
    );
  };

  // Condition Picker
  const ConditionPicker = ({ groupId, section, onSelect, buttonColor }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedCat, setSelectedCat] = useState(null);
    const buttonLabel = section === 'include' ? 'Add condition' : section === 'exclude' ? 'Add exclusion' : 'Add activity filter';

    return (
      <div style={{ position: 'relative' }}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: 'transparent',
            border: `1px dashed ${t.borderLight}`,
            borderRadius: '8px',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '12px',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span style={{ color: buttonColor }}>+</span> {buttonLabel}
        </button>
        
        {isOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => { setIsOpen(false); setSelectedCat(null); }} />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              backgroundColor: t.bgCard,
              border: `1px solid ${t.borderLight}`,
              borderRadius: '12px',
              zIndex: 100,
              overflow: 'hidden',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', maxHeight: '280px' }}>
                <div style={{ width: '140px', borderRight: '1px solid #3f3f46', overflowY: 'auto' }}>
                  {Object.entries(guidedConditions).map(([catName, cat]) => (
                    <button
                      key={catName}
                      onClick={() => setSelectedCat(catName)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        backgroundColor: selectedCat === catName ? '#27272a' : 'transparent',
                        border: 'none',
                        borderLeft: selectedCat === catName ? `3px solid ${cat.color}` : '3px solid transparent',
                        color: selectedCat === catName ? '#fafafa' : '#a1a1aa',
                        cursor: 'pointer',
                        fontSize: '11px',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{cat.icon}</span> {catName}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1, padding: '6px', overflowY: 'auto', minWidth: '180px' }}>
                  {selectedCat ? (
                    guidedConditions[selectedCat].conditions.map(cond => (
                      <button
                        key={cond.id}
                        onClick={() => {
                          onSelect({
                            conditionId: cond.id,
                            label: cond.label,
                            icon: guidedConditions[selectedCat].icon,
                            value: cond.options ? cond.options[0] : cond.defaultValue,
                          });
                          setIsOpen(false);
                          setSelectedCat(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          color: t.text,
                          cursor: 'pointer',
                          fontSize: '12px',
                          textAlign: 'left'
                        }}
                      >
                        {cond.label}
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '20px 12px', textAlign: 'center', color: t.textMuted, fontSize: '11px' }}>
                      ← Select category
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const LogicConnector = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0' }}>
      <div style={{ height: '14px', width: '2px', backgroundColor: t.borderLight }} />
      <button
        onClick={() => setGroupLogic(groupLogic === 'OR' ? 'AND' : 'OR')}
        style={{
          margin: '0 -1px',
          padding: '4px 12px',
          backgroundColor: groupLogic === 'OR' ? '#7c3aed' : '#0891b2',
          border: 'none',
          borderRadius: '12px',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '10px',
          fontWeight: '700'
        }}
      >
        {groupLogic}
      </button>
      <div style={{ height: '14px', width: '2px', backgroundColor: t.borderLight }} />
    </div>
  );

  // Filter Group Component
  const FilterGroup = ({ group, index }) => (
    <div style={{
      backgroundColor: t.bg,
      borderRadius: '10px',
      border: `2px solid ${group.color}30`,
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '8px 12px',
        backgroundColor: `${group.color}10`,
        borderBottom: `1px solid ${group.color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '5px',
            backgroundColor: group.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: '700',
            color: '#fff'
          }}>
            {index + 1}
          </div>
          <input
            type="text"
            value={group.name}
            onChange={(e) => setFilterGroups(filterGroups.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))}
            style={{
              background: 'none',
              border: 'none',
              color: t.text,
              fontSize: '12px',
              fontWeight: '600',
              width: '80px'
            }}
          />
        </div>
        {filterGroups.length > 1 && (
          <button onClick={() => removeGroup(group.id)} style={{
            background: 'none',
            border: 'none',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '16px'
          }}>×</button>
        )}
      </div>

      <div style={{ padding: '12px' }}>
        {/* Include */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: t.success, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>✓</span> INCLUDE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.filters.include.map(f => (
              <ConfigurableFilterPill key={f.id} filter={f} groupId={group.id} section="include" color="#22c55e" />
            ))}
            <ConditionPicker
              groupId={group.id}
              section="include"
              onSelect={(filter) => addFilterToGroup(group.id, 'include', filter)}
              buttonColor="#22c55e"
            />
          </div>
        </div>

        {/* Exclude */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: t.danger, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>✕</span> EXCLUDE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.filters.exclude.map(f => (
              <ConfigurableFilterPill key={f.id} filter={f} groupId={group.id} section="exclude" color="#ef4444" />
            ))}
            <ConditionPicker
              groupId={group.id}
              section="exclude"
              onSelect={(filter) => addFilterToGroup(group.id, 'exclude', filter)}
              buttonColor="#ef4444"
            />
          </div>
        </div>

        {/* Activity */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: '600', color: '#06b6d4', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📧</span> ACTIVITY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.filters.activity.map(f => (
              <ConfigurableFilterPill key={f.id} filter={f} groupId={group.id} section="activity" color="#06b6d4" />
            ))}
            <ConditionPicker
              groupId={group.id}
              section="activity"
              onSelect={(filter) => addFilterToGroup(group.id, 'activity', filter)}
              buttonColor="#06b6d4"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', height: '100%' }}>
      {/* Main Builder */}
      <div style={{ overflowY: 'auto', paddingRight: '8px' }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '16px',
          backgroundColor: t.bgHover,
          padding: '3px',
          borderRadius: '8px',
          width: 'fit-content'
        }}>
          {[
            { id: 'simple', label: 'Guided', icon: '✨' },
            { id: 'advanced', label: 'Advanced', icon: '⚙️' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '500',
                backgroundColor: activeTab === tab.id ? '#3b82f6' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#71717a',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* GUIDED TAB CONTENT */}
        {activeTab === 'simple' && (
          <>
            {/* Groups Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              padding: '8px 12px',
              backgroundColor: t.bgHover,
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: t.textSecondary }}>Filter Groups</span>
                {filterGroups.length > 1 && (
                  <span style={{
                    padding: '2px 6px',
                    backgroundColor: groupLogic === 'OR' ? '#7c3aed25' : '#0891b225',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: '600',
                    color: groupLogic === 'OR' ? '#a78bfa' : '#22d3ee'
                  }}>
                    {filterGroups.length} groups • {groupLogic}
                  </span>
                )}
              </div>
              <button
                onClick={addGroup}
                style={{
                  padding: '4px 8px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: '500'
                }}
              >
                + Add Group
              </button>
            </div>

            {/* Groups */}
            {filterGroups.map((group, index) => (
              <React.Fragment key={group.id}>
                <FilterGroup group={group} index={index} />
                {index < filterGroups.length - 1 && <LogicConnector />}
              </React.Fragment>
            ))}

            {/* Timing */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: t.primary }}>⏱</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: t.text }}>Timing</span>
              </div>
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: t.textSecondary }}>When</span>
                  <select style={{
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.borderLight}`,
                    borderRadius: '4px',
                    padding: '6px 8px',
                    color: t.text,
                    fontSize: '11px'
                  }}>
                    <option>Days until expiration</option>
                    <option>Days since effective</option>
                    <option>Days since status change</option>
                  </select>
                  <span style={{ fontSize: '12px', color: t.textSecondary }}>is between</span>
                  <input type="number" defaultValue={sharedTiming.min} style={{
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.borderLight}`,
                    borderRadius: '4px',
                    padding: '6px',
                    color: t.text,
                    fontSize: '11px',
                    width: '45px',
                    textAlign: 'center'
                  }} />
                  <span style={{ fontSize: '12px', color: t.textSecondary }}>and</span>
                  <input type="number" defaultValue={sharedTiming.max} style={{
                    backgroundColor: t.bgHover,
                    border: `1px solid ${t.borderLight}`,
                    borderRadius: '4px',
                    padding: '6px',
                    color: t.text,
                    fontSize: '11px',
                    width: '45px',
                    textAlign: 'center'
                  }} />
                  <span style={{ fontSize: '12px', color: t.textSecondary }}>days</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ADVANCED TAB CONTENT */}
        {activeTab === 'advanced' && (
          <>
            {/* Groups Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              padding: '8px 12px',
              backgroundColor: t.bgHover,
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: t.textSecondary }}>Rule Groups</span>
                <button
                  onClick={() => setGroupLogic(groupLogic === 'OR' ? 'AND' : 'OR')}
                  style={{
                    padding: '3px 8px',
                    backgroundColor: groupLogic === 'OR' ? '#7c3aed' : '#0891b2',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '9px',
                    fontWeight: '700'
                  }}
                >
                  {groupLogic}
                </button>
                <span style={{ fontSize: '10px', color: t.textMuted }}>between groups</span>
              </div>
              <button
                onClick={addGroup}
                style={{
                  padding: '4px 8px',
                  backgroundColor: t.primary,
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: '500'
                }}
              >
                + Add Group
              </button>
            </div>

            {/* Advanced Groups */}
            {filterGroups.map((group, groupIndex) => (
              <React.Fragment key={group.id}>
                <div style={{
                  backgroundColor: t.bg,
                  borderRadius: '10px',
                  border: `2px solid ${group.color}30`,
                  marginBottom: groupIndex < filterGroups.length - 1 ? '0' : '16px',
                  overflow: 'hidden'
                }}>
                  {/* Group Header */}
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: `${group.color}10`,
                    borderBottom: `1px solid ${group.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        backgroundColor: group.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: '700',
                        color: '#fff'
                      }}>
                        {groupIndex + 1}
                      </div>
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) => setFilterGroups(filterGroups.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: t.text,
                          fontSize: '12px',
                          fontWeight: '600',
                          width: '80px'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: t.textMuted }}>Logic:</span>
                      <select
                        value={group.logic}
                        onChange={(e) => setFilterGroups(filterGroups.map(g => g.id === group.id ? { ...g, logic: e.target.value } : g))}
                        style={{
                          backgroundColor: t.bgHover,
                          border: `1px solid ${t.borderLight}`,
                          borderRadius: '4px',
                          padding: '3px 6px',
                          color: t.text,
                          fontSize: '10px'
                        }}
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                      {filterGroups.length > 1 && (
                        <button onClick={() => removeGroup(group.id)} style={{
                          background: 'none',
                          border: 'none',
                          color: t.textMuted,
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}>×</button>
                      )}
                    </div>
                  </div>

                  {/* Rules */}
                  <div style={{ padding: '10px' }}>
                    {[...group.filters.include, ...group.filters.exclude].map((rule, ruleIndex) => (
                      <div key={rule.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 10px',
                        backgroundColor: t.bgHover,
                        borderRadius: '6px',
                        marginBottom: '6px'
                      }}>
                        <span style={{ fontSize: '10px', color: t.textMuted, width: '16px', fontFamily: 'monospace' }}>{ruleIndex + 1}.</span>
                        <select style={{
                          backgroundColor: t.bgCard,
                          border: `1px solid ${t.borderLight}`,
                          borderRadius: '4px',
                          padding: '5px 8px',
                          color: t.textSecondary,
                          fontSize: '10px',
                          width: '80px'
                        }}>
                          <option>Field</option>
                          <option>Relationship</option>
                        </select>
                        <select style={{
                          backgroundColor: t.bgCard,
                          border: `1px solid ${t.borderLight}`,
                          borderRadius: '4px',
                          padding: '5px 8px',
                          color: t.text,
                          fontSize: '10px',
                          width: '70px'
                        }}>
                          <option>Policy</option>
                          <option>Account</option>
                          <option>Contact</option>
                        </select>
                        <span style={{ color: t.borderLight, fontSize: '10px' }}>.</span>
                        <select style={{
                          backgroundColor: t.bgCard,
                          border: `1px solid ${t.borderLight}`,
                          borderRadius: '4px',
                          padding: '5px 8px',
                          color: t.text,
                          fontSize: '10px',
                          flex: 1
                        }}>
                          <option>Type</option>
                          <option>Status</option>
                          <option>Premium</option>
                          <option>Effective Date</option>
                          <option>Expiration Date</option>
                        </select>
                        <select style={{
                          backgroundColor: t.bgCard,
                          border: `1px solid ${t.borderLight}`,
                          borderRadius: '4px',
                          padding: '5px 8px',
                          color: group.filters.exclude.find(f => f.id === rule.id) ? '#f87171' : '#4ade80',
                          fontSize: '10px',
                          width: '80px'
                        }}>
                          <option>equals</option>
                          <option>not equals</option>
                          <option>contains</option>
                          <option>is empty</option>
                          <option>is not empty</option>
                        </select>
                        <input 
                          type="text"
                          defaultValue={rule.value || ''}
                          placeholder="value"
                          style={{
                            backgroundColor: t.bgCard,
                            border: `1px solid ${t.borderLight}`,
                            borderRadius: '4px',
                            padding: '5px 8px',
                            color: t.text,
                            fontSize: '10px',
                            width: '70px'
                          }}
                        />
                        <button 
                          onClick={() => {
                            const section = group.filters.include.find(f => f.id === rule.id) ? 'include' : 'exclude';
                            removeFilterFromGroup(group.id, section, rule.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: t.textMuted,
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >×</button>
                      </div>
                    ))}
                    <button 
                      onClick={() => addFilterToGroup(group.id, 'include', { label: 'New Rule', value: '', icon: '📋' })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        backgroundColor: 'transparent',
                        border: `1px dashed ${t.borderLight}`,
                        borderRadius: '6px',
                        color: t.textMuted,
                        cursor: 'pointer',
                        fontSize: '10px'
                      }}
                    >
                      + Add Rule
                    </button>
                  </div>
                </div>
                {groupIndex < filterGroups.length - 1 && <LogicConnector />}
              </React.Fragment>
            ))}

            {/* Timing */}
            <div style={{
              padding: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: t.primary, marginBottom: '8px' }}>⏱ Timing Window</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <select style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '6px 8px',
                  color: t.text,
                  fontSize: '10px'
                }}>
                  <option>Policy.ExpirationDate</option>
                  <option>Policy.EffectiveDate</option>
                  <option>Account.StatusChangeDate</option>
                  <option>EmailActivity.LastSentDate</option>
                </select>
                <select style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '6px 8px',
                  color: t.text,
                  fontSize: '10px'
                }}>
                  <option>days from now between</option>
                  <option>days ago between</option>
                </select>
                <input type="number" defaultValue="45" style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '6px',
                  color: t.text,
                  fontSize: '10px',
                  width: '40px',
                  textAlign: 'center'
                }} />
                <span style={{ color: t.textMuted, fontSize: '10px' }}>AND</span>
                <input type="number" defaultValue="60" style={{
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.borderLight}`,
                  borderRadius: '4px',
                  padding: '6px',
                  color: t.text,
                  fontSize: '10px',
                  width: '40px',
                  textAlign: 'center'
                }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sidebar */}
      <div style={{ 
        backgroundColor: t.bg, 
        borderRadius: '10px', 
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflowY: 'auto'
      }}>
        {/* Preview */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', marginBottom: '10px' }}>
            Audience Preview
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '12px' }}>
            <span style={{ fontSize: '32px', fontWeight: '700', color: t.primary, fontFamily: 'monospace', lineHeight: 1 }}>
              1,247
            </span>
            <span style={{ color: t.textMuted, fontSize: '12px' }}>match</span>
          </div>
          
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <div style={{ flex: 1, padding: '8px', backgroundColor: t.bgHover, borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: t.success }}>2,847</div>
              <div style={{ fontSize: '9px', color: t.textMuted }}>Included</div>
            </div>
            <div style={{ flex: 1, padding: '8px', backgroundColor: t.bgHover, borderRadius: '6px', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: t.danger }}>1,600</div>
              <div style={{ fontSize: '9px', color: t.textMuted }}>Excluded</div>
            </div>
          </div>

          {filterGroups.length > 1 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', color: t.textMuted, marginBottom: '4px' }}>By group:</div>
              {filterGroups.map((group, i) => (
                <div key={group.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  backgroundColor: t.bgHover,
                  borderRadius: '4px',
                  marginBottom: '3px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '3px',
                      backgroundColor: group.color,
                      fontSize: '8px',
                      fontWeight: '700',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>{i + 1}</div>
                    <span style={{ fontSize: '10px', color: t.textSecondary }}>{group.name}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: group.color }}>
                    {i === 0 ? '847' : '523'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Test Panel */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
            🔍 Test with Account
          </div>
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Search accounts..."
              value={testSearch}
              onChange={(e) => setTestSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                paddingRight: '30px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.borderLight}`,
                borderRadius: '6px',
                color: t.text,
                fontSize: '11px'
              }}
            />
            <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: t.textMuted, fontSize: '12px' }}>🔎</span>
          </div>

          {/* Test Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {testAccounts.map((account) => (
              <div 
                key={account.id}
                onClick={() => setSelectedTestAccount(selectedTestAccount === account.id ? null : account.id)}
                style={{
                  padding: '8px 10px',
                  backgroundColor: account.passes ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${account.passes ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: t.text }}>{account.name}</div>
                    <div style={{ fontSize: '9px', color: t.textMuted }}>{account.policies}</div>
                  </div>
                  <div style={{
                    padding: '3px 8px',
                    backgroundColor: account.passes ? '#22c55e' : '#ef4444',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: '600',
                    color: '#fff'
                  }}>
                    {account.passes ? '✓ Pass' : '✗ Fail'}
                  </div>
                </div>

                {/* Expanded details */}
                {selectedTestAccount === account.id && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '9px', fontWeight: '600', color: t.textMuted, marginBottom: '6px' }}>CONDITION RESULTS</div>
                    {account.conditions.map((cond, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        marginBottom: '4px',
                        padding: '4px 6px',
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        borderRadius: '4px'
                      }}>
                        <span style={{ 
                          fontSize: '10px', 
                          color: cond.passes ? '#22c55e' : '#ef4444',
                          flexShrink: 0
                        }}>
                          {cond.passes ? '✓' : '✗'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '10px', color: t.text }}>{cond.label}</div>
                          {!cond.passes && cond.reason && (
                            <div style={{ fontSize: '9px', color: t.danger, marginTop: '2px' }}>
                              {cond.reason}
                            </div>
                          )}
                          {cond.value && (
                            <div style={{ fontSize: '9px', color: t.textMuted, marginTop: '2px' }}>
                              Actual: {cond.value}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {/* Group results */}
                    {filterGroups.length > 1 && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '9px', color: t.textMuted, marginBottom: '4px' }}>GROUP RESULTS</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {account.groupResults.map((gr, i) => (
                            <div key={i} style={{
                              flex: 1,
                              padding: '4px',
                              backgroundColor: gr.passes ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              borderRadius: '4px',
                              textAlign: 'center'
                            }}>
                              <div style={{ 
                                fontSize: '9px', 
                                fontWeight: '600', 
                                color: filterGroups[i]?.color || '#71717a' 
                              }}>
                                G{i + 1}
                              </div>
                              <div style={{ fontSize: '10px', color: gr.passes ? '#22c55e' : '#ef4444' }}>
                                {gr.passes ? '✓' : '✗'}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: '9px', color: t.textMuted, textAlign: 'center', marginTop: '4px' }}>
                          {groupLogic === 'OR' ? 'Needs 1 group to pass' : 'Needs all groups to pass'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button style={{
            width: '100%',
            marginTop: '8px',
            padding: '6px',
            backgroundColor: 'transparent',
            border: `1px dashed ${t.borderLight}`,
            borderRadius: '6px',
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '10px'
          }}>
            View all matching records →
          </button>
        </div>

        {/* Summary */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
            Summary
          </div>
          <div style={{ fontSize: '10px', color: t.textSecondary, lineHeight: '1.6' }}>
            {filterGroups.map((group, i) => (
              <React.Fragment key={group.id}>
                <div style={{
                  padding: '6px',
                  backgroundColor: `${group.color}10`,
                  borderRadius: '4px',
                  border: `1px solid ${group.color}20`,
                  marginBottom: i < filterGroups.length - 1 ? '0' : '0'
                }}>
                  <div style={{ fontWeight: '600', color: group.color, marginBottom: '2px', fontSize: '9px' }}>
                    {group.name}
                  </div>
                  <div style={{ color: t.text, fontSize: '10px' }}>
                    {group.filters.include.map(f => `${f.label}: ${f.value || ''}`).join(' + ')}
                    {group.filters.exclude.length > 0 && (
                      <span style={{ color: t.danger }}>
                        {' '}− {group.filters.exclude.map(f => `${f.value || f.label}`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                {i < filterGroups.length - 1 && (
                  <div style={{ textAlign: 'center', padding: '3px 0', fontWeight: '700', fontSize: '9px', color: groupLogic === 'OR' ? '#a78bfa' : '#22d3ee' }}>
                    {groupLogic}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


// ============================================
// WORKFLOW BUILDER COMPONENT
// ============================================

const defaultNodes = [
  {
    id: 'entry-criteria',
    type: 'entry_criteria',
    title: 'Entry Criteria',
    subtitle: 'Define who enters this automation',
    config: { filterConfig: {} }
  },
  {
    id: 'trigger',
    type: 'trigger',
    title: 'Trigger',
    subtitle: 'Daily at 09:00 (Central)',
    config: { time: '09:00', timezone: 'America/Chicago', frequency: 'Daily' }
  },
  {
    id: 'node-1',
    type: 'send_email',
    title: 'Send Email',
    subtitle: 'Select template...',
    config: { template: '' }
  }
];

const WorkflowBuilder = ({ t: themeProp, automation, onUpdate, onSave }) => {
  // Use provided theme or default
  const t = themeProp || defaultTheme;
  
  // Use automation nodes if they exist and have items, otherwise use defaults
  const initialNodes = (automation?.nodes && automation.nodes.length > 0) 
    ? automation.nodes 
    : defaultNodes;
  
  const [nodes, setNodes] = useState(initialNodes);

  const [selectedNode, setSelectedNode] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const nodeTypes = {
    entry_criteria: { icon: '🎯', color: '#8b5cf6', label: 'Entry Criteria' },
    trigger: { icon: '⚡', color: t.primary, label: 'Trigger' },
    send_email: { icon: '📧', color: t.success, label: 'Send Email' },
    delay: { icon: '⏱', color: t.warning, label: 'Delay' },
    condition: { icon: '🔀', color: t.purple, label: 'Condition' },
    field_condition: { icon: '📋', color: '#ec4899', label: 'Field Check' },
    update_field: { icon: '✏️', color: '#06b6d4', label: 'Update Field' },
    end: { icon: '🏁', color: t.textMuted, label: 'End' }
  };

  const availableNodes = [
    { type: 'send_email', label: 'Send Email', desc: 'Send an email template', icon: '📧' },
    { type: 'delay', label: 'Delay', desc: 'Wait before continuing', icon: '⏱' },
    { type: 'condition', label: 'Email Engagement', desc: 'Branch on open/click', icon: '📬' },
    { type: 'field_condition', label: 'Field Condition', desc: 'Branch on field value', icon: '🔀' },
    { type: 'update_field', label: 'Update Field', desc: 'Update a record field', icon: '✏️' },
    { type: 'end', label: 'End', desc: 'Stop automation', icon: '🏁' },
  ];

  const addNode = (afterNodeId, nodeType, branch = null) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: nodeType,
      title: availableNodes.find(n => n.type === nodeType)?.label || nodeType,
      subtitle: 'Configure...',
      config: {}
    };
    if (nodeType === 'condition' || nodeType === 'field_condition') {
      newNode.branches = { yes: [], no: [] };
    }

    if (branch) {
      setNodes(prev => {
        const updateBranches = (nodeList) => nodeList.map(node => {
          if (node.id === afterNodeId && node.branches) {
            return { ...node, branches: { ...node.branches, [branch]: [...node.branches[branch], newNode] } };
          }
          if (node.branches) {
            return { ...node, branches: { yes: updateBranches(node.branches.yes), no: updateBranches(node.branches.no) } };
          }
          return node;
        });
        return updateBranches(prev);
      });
    } else {
      const index = nodes.findIndex(n => n.id === afterNodeId);
      const newNodes = [...nodes];
      newNodes.splice(index + 1, 0, newNode);
      setNodes(newNodes);
    }
    setShowAddMenu(null);
    setSelectedNode(newNode.id);
  };

  const deleteNode = (nodeId) => {
    // Don't allow deleting entry_criteria or trigger nodes
    setNodes(prev => prev.filter(n => n.id !== nodeId && n.id !== 'trigger' && n.id !== 'entry-criteria'));
    if (selectedNode === nodeId) setSelectedNode(null);
  };

  // Node Component
  const WorkflowNode = ({ node }) => {
    const typeConfig = nodeTypes[node.type] || nodeTypes.send_email;
    const isSelected = selectedNode === node.id;
    const isEntryCriteria = node.type === 'entry_criteria';
    const isTrigger = node.type === 'trigger';
    const isProtected = isEntryCriteria || isTrigger; // Can't delete these

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          onClick={() => {
            setSelectedNode(node.id);
            if (isEntryCriteria) {
              setShowFilterPanel(true);
            }
          }}
          style={{
            width: '320px',
            backgroundColor: t.bgCard,
            border: isSelected ? `2px solid ${typeConfig.color}` : `1px solid ${t.border}`,
            borderRadius: '12px',
            padding: '16px 18px',
            cursor: 'pointer',
            position: 'relative'
          }}
        >
          {!isProtected && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >×</button>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: `${typeConfig.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              {typeConfig.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>{node.title}</div>
              <div style={{ fontSize: '12px', color: t.textMuted, marginTop: '2px' }}>{node.subtitle}</div>
            </div>
          </div>

          {isEntryCriteria && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowFilterPanel(true); }}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '10px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.borderLight}`,
                borderRadius: '8px',
                color: t.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>🎯</span> Edit Entry Criteria
            </button>
          )}
        </div>

        {/* Connector */}
        {!node.branches && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            <div style={{ width: '2px', height: '20px', backgroundColor: t.borderLight }} />
            <button
              onClick={() => setShowAddMenu({ afterNodeId: node.id, branch: null })}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.borderLight}`,
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >+</button>
            <div style={{ width: '2px', height: '20px', backgroundColor: t.borderLight }} />
            
            {showAddMenu?.afterNodeId === node.id && !showAddMenu?.branch && (
              <AddNodeMenu onSelect={(type) => addNode(node.id, type)} onClose={() => setShowAddMenu(null)} />
            )}
          </div>
        )}

        {/* Branches */}
        {node.branches && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '2px', height: '20px', backgroundColor: t.borderLight }} />
            <div style={{ display: 'flex' }}>
              {/* Yes */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '340px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '60px', height: '2px', backgroundColor: t.success }} />
                  <span style={{ padding: '4px 10px', backgroundColor: '#22c55e20', borderRadius: '12px', fontSize: '10px', fontWeight: '600', color: t.success }}>YES</span>
                </div>
                <div style={{ width: '2px', height: '20px', backgroundColor: t.success }} />
                {node.branches.yes.map(n => <WorkflowNode key={n.id} node={n} />)}
                <button
                  onClick={() => setShowAddMenu({ afterNodeId: node.id, branch: 'yes' })}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: t.bgHover,
                    border: '1px dashed #22c55e',
                    color: t.success,
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '10px'
                  }}
                >+</button>
                {showAddMenu?.afterNodeId === node.id && showAddMenu?.branch === 'yes' && (
                  <AddNodeMenu onSelect={(type) => addNode(node.id, type, 'yes')} onClose={() => setShowAddMenu(null)} />
                )}
              </div>
              {/* No */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '340px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ padding: '4px 10px', backgroundColor: '#ef444420', borderRadius: '12px', fontSize: '10px', fontWeight: '600', color: t.danger }}>NO</span>
                  <div style={{ width: '60px', height: '2px', backgroundColor: t.danger }} />
                </div>
                <div style={{ width: '2px', height: '20px', backgroundColor: t.danger }} />
                {node.branches.no.map(n => <WorkflowNode key={n.id} node={n} />)}
                <button
                  onClick={() => setShowAddMenu({ afterNodeId: node.id, branch: 'no' })}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: t.bgHover,
                    border: '1px dashed #ef4444',
                    color: t.danger,
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '10px'
                  }}
                >+</button>
                {showAddMenu?.afterNodeId === node.id && showAddMenu?.branch === 'no' && (
                  <AddNodeMenu onSelect={(type) => addNode(node.id, type, 'no')} onClose={() => setShowAddMenu(null)} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const AddNodeMenu = ({ onSelect, onClose }) => (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: '10px',
        backgroundColor: t.bgCard,
        border: `1px solid ${t.borderLight}`,
        borderRadius: '12px',
        padding: '8px',
        zIndex: 100,
        width: '240px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
      }}>
        {availableNodes.map(node => (
          <button
            key={node.type}
            onClick={() => onSelect(node.type)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: t.text,
              textAlign: 'left'
            }}
          >
            <span style={{ fontSize: '18px' }}>{node.icon}</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500' }}>{node.label}</div>
              <div style={{ fontSize: '11px', color: t.textMuted }}>{node.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );

  const selectedNodeData = nodes.find(n => n.id === selectedNode) || 
    nodes.flatMap(n => n.branches ? [...(n.branches.yes || []), ...(n.branches.no || [])] : []).find(n => n.id === selectedNode);

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
      backgroundColor: t.bg,
      height: '100%',
      color: t.text,
      display: 'flex'
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left - Nodes */}
        <div style={{ width: '220px', borderRight: `1px solid ${t.border}`, padding: '16px', backgroundColor: t.bgCard, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: t.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>Add Nodes</div>
          {availableNodes.map(node => (
            <div key={node.type} style={{
              padding: '12px',
              backgroundColor: t.bgHover,
              borderRadius: '8px',
              marginBottom: '8px',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '18px' }}>{node.icon}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>{node.label}</div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>{node.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Center - Canvas */}
        <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {nodes.map(node => <WorkflowNode key={node.id} node={node} />)}
            <div style={{ marginTop: '16px', padding: '8px 18px', backgroundColor: t.bgHover, borderRadius: '20px', fontSize: '12px', color: t.textMuted }}>
              End of automation
            </div>
          </div>
        </div>

        {/* Right - Config */}
        <div style={{ width: '300px', borderLeft: `1px solid ${t.border}`, backgroundColor: t.bgCard, overflowY: 'auto' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}`, fontSize: '11px', fontWeight: '600', color: t.textMuted, textTransform: 'uppercase' }}>
            Configuration
          </div>
          <div style={{ padding: '18px' }}>
            {selectedNodeData ? (
              <div style={{ fontSize: '13px', color: t.textSecondary }}>
                <div style={{ fontWeight: '600', color: t.text, marginBottom: '10px', fontSize: '15px' }}>{selectedNodeData.title}</div>
                <p>Configure this {nodeTypes[selectedNodeData.type]?.label || 'node'} step.</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: t.textMuted, padding: '30px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>👆</div>
                <div style={{ fontSize: '13px' }}>Select a node to configure</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Panel Modal */}
      {showFilterPanel && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200 }} onClick={() => setShowFilterPanel(false)} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '1000px',
            height: '80vh',
            backgroundColor: t.bgCard,
            borderRadius: '16px',
            border: `1px solid ${t.border}`,
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <h2 style={{ fontSize: '15px', fontWeight: '600', color: t.text, margin: 0 }}>Audience Criteria</h2>
              <button onClick={() => setShowFilterPanel(false)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '18px' }}>×</button>
            </div>
            <div style={{ flex: 1, padding: '20px', overflow: 'hidden' }}>
              <FilterBuilder onClose={() => setShowFilterPanel(false)} t={t} />
            </div>
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              flexShrink: 0
            }}>
              <button onClick={() => setShowFilterPanel(false)} style={{
                padding: '8px 16px',
                backgroundColor: t.bgHover,
                border: `1px solid ${t.borderLight}`,
                borderRadius: '6px',
                color: t.textSecondary,
                cursor: 'pointer',
                fontSize: '12px'
              }}>Cancel</button>
              <button onClick={() => setShowFilterPanel(false)} style={{
                padding: '8px 16px',
                backgroundColor: t.primary,
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}>Save Criteria</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkflowBuilder;
