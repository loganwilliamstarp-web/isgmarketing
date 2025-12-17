import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  useAccounts, 
  useAccountSearch,
  useCustomers,
  useProspects,
  useExpiringPolicies
} from '../hooks';

// Loading skeleton
const Skeleton = ({ width = '100%', height = '20px' }) => (
  <div style={{ width, height, backgroundColor: 'currentColor', opacity: 0.1, borderRadius: '4px' }} />
);

// Account type badge
const TypeBadge = ({ type, theme: t }) => {
  const colors = {
    Customer: { bg: `${t.success}20`, text: t.success },
    Prospect: { bg: `${t.primary}20`, text: t.primary },
    Prior: { bg: `${t.textMuted}20`, text: t.textMuted },
    Lead: { bg: `${t.warning}20`, text: t.warning },
  };
  const c = colors[type] || colors.Prospect;
  
  return (
    <span style={{
      padding: '4px 10px',
      backgroundColor: c.bg,
      color: c.text,
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '500'
    }}>
      {type}
    </span>
  );
};

// Policy badge
const PolicyBadge = ({ policyType, status, theme: t }) => {
  const isActive = status === 'active';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '3px 8px',
      backgroundColor: isActive ? `${t.success}10` : `${t.textMuted}10`,
      borderRadius: '6px',
      fontSize: '11px',
      color: isActive ? t.success : t.textMuted
    }}>
      {isActive ? '✓' : '○'} {policyType}
    </span>
  );
};

// Client row component
const ClientRow = ({ client, onClick, theme: t }) => (
  <tr 
    style={{ borderTop: `1px solid ${t.border}`, cursor: 'pointer' }}
    onClick={onClick}
    onMouseOver={(e) => e.currentTarget.style.backgroundColor = t.bgHover}
    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
  >
    <td style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          backgroundColor: t.bgHover,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          color: t.textMuted
        }}>
          {client.name?.charAt(0).toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '500', color: t.text }}>
            {client.name}
          </div>
          <div style={{ fontSize: '12px', color: t.textMuted }}>
            {client.email}
          </div>
        </div>
      </div>
    </td>
    <td style={{ padding: '14px 16px' }}>
      <TypeBadge type={client.account_type || client.type} theme={t} />
    </td>
    <td style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {client.policies?.slice(0, 3).map((policy, i) => (
          <PolicyBadge 
            key={i} 
            policyType={policy.policy_type} 
            status={policy.status}
            theme={t} 
          />
        )) || <span style={{ fontSize: '13px', color: t.textMuted }}>No policies</span>}
        {client.policies?.length > 3 && (
          <span style={{ fontSize: '11px', color: t.textMuted }}>
            +{client.policies.length - 3} more
          </span>
        )}
      </div>
    </td>
    <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
      {client.email_stats?.total_sent || 0}
    </td>
    <td style={{ padding: '14px 16px', fontSize: '14px', color: t.textSecondary }}>
      {client.email_stats?.last_sent 
        ? new Date(client.email_stats.last_sent).toLocaleDateString() 
        : 'Never'
      }
    </td>
    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          onClick={(e) => { e.stopPropagation(); /* Open email modal */ }}
          style={{
            padding: '6px 12px',
            backgroundColor: t.primary,
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          📧 Email
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          style={{
            padding: '6px 12px',
            backgroundColor: t.bgHover,
            border: `1px solid ${t.border}`,
            borderRadius: '6px',
            color: t.textSecondary,
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          View
        </button>
      </div>
    </td>
  </tr>
);

// Stats card
const StatsCard = ({ label, value, icon, color, theme: t }) => (
  <div style={{
    padding: '16px',
    backgroundColor: t.bgCard,
    borderRadius: '10px',
    border: `1px solid ${t.border}`,
    textAlign: 'center'
  }}>
    <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
    <div style={{ fontSize: '24px', fontWeight: '700', color: color || t.text }}>{value}</div>
    <div style={{ fontSize: '12px', color: t.textSecondary }}>{label}</div>
  </div>
);

// Main Clients Page Component
const ClientsPage = ({ t }) => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Fetch accounts
  const { data: allAccounts, isLoading, error } = useAccounts();
  const { data: searchResults, isLoading: searchLoading } = useAccountSearch(
    searchQuery.length >= 2 ? searchQuery : null
  );
  const { data: expiringPolicies } = useExpiringPolicies(30);

  // Use search results if searching, otherwise filter all accounts
  const displayAccounts = useMemo(() => {
    let accounts = searchQuery.length >= 2 ? searchResults : allAccounts;
    
    if (!accounts) return [];
    
    // Apply type filter
    if (typeFilter !== 'all') {
      accounts = accounts.filter(a => (a.account_type || a.type) === typeFilter);
    }
    
    // Apply sorting
    return [...accounts].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'name') {
        aVal = aVal?.toLowerCase() || '';
        bVal = bVal?.toLowerCase() || '';
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [allAccounts, searchResults, searchQuery, typeFilter, sortBy, sortOrder]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!allAccounts) return { customers: 0, prospects: 0, prior: 0, expiring: 0 };
    return {
      customers: allAccounts.filter(a => (a.account_type || a.type) === 'Customer').length,
      prospects: allAccounts.filter(a => (a.account_type || a.type) === 'Prospect').length,
      prior: allAccounts.filter(a => (a.account_type || a.type) === 'Prior').length,
      expiring: expiringPolicies?.length || 0
    };
  }, [allAccounts, expiringPolicies]);

  // Navigation
  const handleViewClient = (accountId) => {
    navigate(`/${userId}/accounts/${accountId}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>
            Clients
          </h1>
          <p style={{ color: t.textSecondary, fontSize: '14px', margin: 0 }}>
            View and manage your client database
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => {/* Export functionality */}}
            style={{
              padding: '10px 16px',
              backgroundColor: t.bgHover,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📤 Export
          </button>
          <button
            style={{
              padding: '10px 20px',
              backgroundColor: t.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            + Add Client
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '16px',
          backgroundColor: `${t.danger}15`,
          border: `1px solid ${t.danger}30`,
          borderRadius: '8px',
          marginBottom: '24px',
          color: t.danger,
          fontSize: '14px'
        }}>
          Failed to load accounts. Please try refreshing the page.
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        <StatsCard 
          label="Customers" 
          value={stats.customers} 
          icon="👥" 
          color={t.success}
          theme={t} 
        />
        <StatsCard 
          label="Prospects" 
          value={stats.prospects} 
          icon="🎯" 
          color={t.primary}
          theme={t} 
        />
        <StatsCard 
          label="Prior Clients" 
          value={stats.prior} 
          icon="📁" 
          color={t.textMuted}
          theme={t} 
        />
        <StatsCard 
          label="Expiring in 30d" 
          value={stats.expiring} 
          icon="⚠️" 
          color={t.warning}
          theme={t} 
        />
      </div>

      {/* Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: '350px' }}>
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              backgroundColor: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.text,
              fontSize: '14px'
            }}
          />
          <span style={{ 
            position: 'absolute', 
            left: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: t.textMuted
          }}>
            🔍
          </span>
          {searchLoading && (
            <span style={{ 
              position: 'absolute', 
              right: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: t.textMuted,
              fontSize: '12px'
            }}>
              Searching...
            </span>
          )}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="all">All Types</option>
          <option value="Customer">Customers</option>
          <option value="Prospect">Prospects</option>
          <option value="Prior">Prior</option>
          <option value="Lead">Leads</option>
        </select>

        {/* Sort */}
        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split('-');
            setSortBy(field);
            setSortOrder(order);
          }}
          style={{
            padding: '10px 12px',
            backgroundColor: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: '8px',
            color: t.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
          <option value="created_at-desc">Newest First</option>
          <option value="created_at-asc">Oldest First</option>
        </select>

        {/* Results count */}
        <span style={{ fontSize: '13px', color: t.textMuted, marginLeft: 'auto' }}>
          {displayAccounts.length} client{displayAccounts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Clients Table */}
      {isLoading ? (
        <div style={{
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`,
          padding: '20px'
        }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              gap: '16px', 
              padding: '16px 0', 
              borderTop: i > 0 ? `1px solid ${t.border}` : 'none' 
            }}>
              <Skeleton width="40px" height="40px" />
              <div style={{ flex: 1 }}>
                <Skeleton width="200px" height="16px" />
                <div style={{ marginTop: '8px' }}><Skeleton width="150px" height="12px" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : displayAccounts.length > 0 ? (
        <div style={{
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: t.bgHover }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                  Client
                </th>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                  Type
                </th>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                  Policies
                </th>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                  Emails Sent
                </th>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                  Last Contact
                </th>
                <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: t.textSecondary }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {displayAccounts.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  onClick={() => handleViewClient(client.account_unique_id)}
                  theme={t}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          padding: '60px 20px',
          backgroundColor: t.bgCard,
          borderRadius: '12px',
          border: `1px solid ${t.border}`,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: t.text, marginBottom: '8px' }}>
            {searchQuery ? 'No accounts found' : 'No accounts yet'}
          </h3>
          <p style={{ fontSize: '14px', color: t.textSecondary, marginBottom: '24px' }}>
            {searchQuery 
              ? 'Try adjusting your search criteria.'
              : 'Your accounts will appear here once synced from Salesforce.'
            }
          </p>
        </div>
      )}

      {/* Expiring Policies Alert */}
      {stats.expiring > 0 && (
        <div style={{
          marginTop: '24px',
          padding: '16px 20px',
          backgroundColor: `${t.warning}10`,
          border: `1px solid ${t.warning}30`,
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: t.text }}>
                {stats.expiring} policies expiring in the next 30 days
              </div>
              <div style={{ fontSize: '12px', color: t.textSecondary }}>
                Consider setting up renewal reminders for these accounts.
              </div>
            </div>
          </div>
          <Link
            to={`/${userId}/automations/new?template=renewal`}
            style={{
              padding: '8px 16px',
              backgroundColor: t.warning,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              textDecoration: 'none'
            }}
          >
            Set Up Renewal Automation
          </Link>
        </div>
      )}
    </div>
  );
};

export default ClientsPage;
