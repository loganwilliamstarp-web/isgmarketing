import React, { useState, useEffect, useRef } from 'react';
import { useAuth, USER_ROLES } from '../../contexts/AuthContext';
import { adminService } from '../../services/admin';

/**
 * ScopeFilterDropdown - Site-wide filter for Master Admins and Agency Admins
 *
 * Master Admin: Shows "All Agencies" + list of agencies (profile_names)
 * Agency Admin: Shows "All Agents" + list of agents in their agency
 * Marketing User: Hidden
 */
const ScopeFilterDropdown = ({ t }) => {
  const {
    userRole,
    user,
    scopeFilter,
    updateScopeFilter,
    clearScopeFilter,
    isAdmin,
    isAgencyAdmin,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Determine if user should see the dropdown
  const shouldRender = userRole !== USER_ROLES.MARKETING_USER && (isAdmin || isAgencyAdmin);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!shouldRender) return;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [shouldRender]);

  const fetchItems = async (query = '') => {
    setIsLoading(true);
    try {
      if (isAdmin) {
        // Master Admin: fetch unique agencies
        const agencies = await adminService.getUniqueAgencies();
        const filtered = query
          ? agencies.filter(a => a.toLowerCase().includes(query.toLowerCase()))
          : agencies;
        setItems(filtered.map(agency => ({
          type: 'agency',
          value: agency,
          label: agency,
        })));
      } else if (isAgencyAdmin && user?.profileName) {
        // Agency Admin: fetch agents in their agency
        const agents = await adminService.getAgencyAgents(user.profileName, user.id, query);
        setItems(agents.map(agent => ({
          type: 'agent',
          value: agent.user_unique_id,
          label: `${agent.first_name || ''} ${agent.last_name || ''}`.trim() || agent.email,
          email: agent.email,
        })));
      }
    } catch (err) {
      console.error('Error fetching filter items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = async () => {
    setIsOpen(true);
    setSearchQuery('');
    await fetchItems();
  };

  const handleSearch = (query) => {
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchItems(query);
    }, 300);
  };

  const handleSelectAll = async () => {
    if (isAdmin) {
      // Master Admin selecting "All Agencies" - fetch ALL user IDs
      const allUserIds = await adminService.getAllUserIds();
      updateScopeFilter({
        filterType: 'all_agencies',
        filterValue: null,
        filterLabel: 'All Agencies',
        ownerIds: allUserIds,
      });
    } else if (isAgencyAdmin && user?.profileName) {
      // Agency Admin selecting "All Agents" - show all agents in their agency
      const agentIds = await adminService.getUserIdsByAgency(user.profileName);
      updateScopeFilter({
        filterType: 'all_agents',
        filterValue: user.profileName,
        filterLabel: 'All Agents',
        ownerIds: agentIds,
      });
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleSelectItem = async (item) => {
    if (item.type === 'agency') {
      // Master Admin selected a specific agency
      const agentIds = await adminService.getUserIdsByAgency(item.value);
      updateScopeFilter({
        filterType: 'agency',
        filterValue: item.value,
        filterLabel: item.label,
        ownerIds: agentIds,
      });
    } else if (item.type === 'agent') {
      // Agency Admin selected a specific agent
      updateScopeFilter({
        filterType: 'agent',
        filterValue: item.value,
        filterLabel: item.label,
        ownerIds: [item.value],
      });
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  // Determine the button label based on current filter state
  const getButtonLabel = () => {
    if (!scopeFilter.active) {
      return isAdmin ? 'All Agencies' : 'My Data';
    }
    return scopeFilter.filterLabel || 'Filtered';
  };

  // Determine the "All" option label
  const getAllLabel = () => {
    return isAdmin ? 'All Agencies' : 'All Agents';
  };

  // Don't render for regular marketing users (must be after all hooks)
  if (!shouldRender) {
    return null;
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Dropdown Trigger Button */}
      <button
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: scopeFilter.active ? t.primary + '15' : t.bgHover,
          border: `1px solid ${scopeFilter.active ? t.primary : t.border}`,
          borderRadius: '8px',
          color: scopeFilter.active ? t.primary : t.text,
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '500',
        }}
      >
        <span>{isAdmin ? '🏢' : '👥'}</span>
        <span>{getButtonLabel()}</span>
        <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            width: '280px',
            backgroundColor: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Search Input */}
          <div style={{ padding: '12px', borderBottom: `1px solid ${t.border}` }}>
            <input
              type="text"
              placeholder={isAdmin ? 'Search agencies...' : 'Search agents...'}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '13px',
                border: `1px solid ${t.border}`,
                borderRadius: '8px',
                backgroundColor: t.bgInput,
                color: t.text,
                outline: 'none',
              }}
            />
          </div>

          {/* Items List */}
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {/* "All" Option */}
            <button
              onClick={handleSelectAll}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: !scopeFilter.active ? t.bgHover : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${t.borderLight}`,
                color: t.text,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: !scopeFilter.active ? '600' : '400',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{isAdmin ? '🌐' : '👥'}</span>
              <span>{getAllLabel()}</span>
              {!scopeFilter.active && (
                <span style={{ marginLeft: 'auto', color: t.primary }}>✓</span>
              )}
            </button>

            {/* Loading State */}
            {isLoading && (
              <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted }}>
                Loading...
              </div>
            )}

            {/* Items */}
            {!isLoading && items.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: t.textMuted }}>
                {searchQuery ? 'No results found' : 'No items available'}
              </div>
            )}

            {!isLoading && items.map((item, index) => (
              <button
                key={item.value}
                onClick={() => handleSelectItem(item)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: scopeFilter.filterValue === item.value ? t.bgHover : 'transparent',
                  border: 'none',
                  borderBottom: index < items.length - 1 ? `1px solid ${t.borderLight}` : 'none',
                  color: t.text,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>{item.type === 'agency' ? '🏢' : '👤'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: scopeFilter.filterValue === item.value ? '600' : '400',
                  }}>
                    {item.label}
                  </div>
                  {item.email && (
                    <div style={{ fontSize: '11px', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.email}
                    </div>
                  )}
                </div>
                {scopeFilter.filterValue === item.value && (
                  <span style={{ color: t.primary }}>✓</span>
                )}
              </button>
            ))}
          </div>

          {/* Clear Filter Button (only shown when filter is active) */}
          {scopeFilter.active && (
            <div style={{ padding: '12px', borderTop: `1px solid ${t.border}` }}>
              <button
                onClick={() => {
                  clearScopeFilter();
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${t.danger}`,
                  borderRadius: '8px',
                  color: t.danger,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                Clear Filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScopeFilterDropdown;
