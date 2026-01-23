import React, { useState, createContext, useContext, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/queryClient';
import { userSettingsService } from './services/userSettings';
import { adminService } from './services/admin';

// Auth imports
import { AuthProvider, useAuth, USER_ROLES } from './contexts/AuthContext';
import { LoginPage, ProtectedRoute, ImpersonationBanner } from './components/auth';
import { ScopeFilterDropdown } from './components/filters';
import { SetupChecklistFloater, TrialExpiredBanner } from './components/trial';

// Lazy-loaded page components for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientProfilePage = lazy(() => import('./pages/ClientProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WorkflowBuilderPage = lazy(() => import('./pages/WorkflowBuilderPage'));
const MassEmailPage = lazy(() => import('./pages/MassEmailPage'));
const KnowledgeCenterPage = lazy(() => import('./pages/KnowledgeCenterPage'));
const ScheduledEmailsPage = lazy(() => import('./pages/ScheduledEmailsPage'));
const EmailActivityPage = lazy(() => import('./pages/EmailActivityPage'));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

// ============================================
// PAGE LOADING FALLBACK
// ============================================
const PageLoader = ({ t }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    flexDirection: 'column',
    gap: '16px'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: `3px solid ${t?.border || '#e2e8f0'}`,
      borderTopColor: t?.primary || '#3b82f6',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ============================================
// THEME CONTEXT
// ============================================
const ThemeContext = createContext();

const themes = {
  light: {
    bg: '#f8fafc',
    bgCard: '#ffffff',
    bgSidebar: '#ffffff',
    bgHover: '#f1f5f9',
    bgInput: '#ffffff',
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    text: '#1e293b',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#f59e0b',
    purple: '#a78bfa',
  },
  dark: {
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
  }
};

export const useTheme = () => useContext(ThemeContext);

// ============================================
// USER CONTEXT
// ============================================
const UserContext = createContext();
export const useUser = () => useContext(UserContext);

// ============================================
// IMPERSONATION USER PICKER
// ============================================
const ImpersonationPicker = ({ t }) => {
  const navigate = useNavigate();
  const { isAdmin, isAgencyAdmin, user, impersonate, impersonating } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = React.useRef(null);

  // Don't render if not admin or agency admin
  if (!isAdmin && !isAgencyAdmin) return null;

  const fetchUsers = async (query = '') => {
    setIsLoading(true);
    try {
      if (isAdmin) {
        // Master Admin can see all users
        const data = await adminService.getAllUsers(query);
        setUsers(data);
      } else if (isAgencyAdmin && user?.profileName) {
        // Agency Admin can only see agents in their agency
        const data = await adminService.getAgencyAgents(user.profileName, user.id, query);
        setUsers(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = async () => {
    setIsOpen(true);
    await fetchUsers();
  };

  const handleSearch = (query) => {
    setSearchQuery(query);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search - wait 300ms after typing stops
    searchTimeoutRef.current = setTimeout(() => {
      fetchUsers(query);
    }, 300);
  };

  const handleSelectUser = (selectedUser) => {
    const userName = `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || selectedUser.email;
    impersonate(selectedUser.user_unique_id, userName, selectedUser.profile_name);
    setIsOpen(false);
    setSearchQuery('');
    navigate(`/${selectedUser.user_unique_id}/dashboard`);
  };

  // Determine the label based on user role
  const getPickerLabel = () => {
    if (isAdmin) return 'View As User';
    return 'View As Agent';
  };

  const getPickerDescription = () => {
    if (isAdmin) return 'Select a user to impersonate';
    return 'Select an agent in your agency to impersonate';
  };

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          display: 'flex',
          width: '100%',
          padding: '10px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '8px',
          color: t.textSecondary,
          cursor: 'pointer',
          fontSize: '13px',
          textAlign: 'left',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {getPickerLabel()}
        {impersonating.active && (
          <span style={{
            marginLeft: 'auto',
            padding: '2px 6px',
            backgroundColor: t.warning,
            borderRadius: '4px',
            fontSize: '9px',
            color: '#fff',
            fontWeight: '600'
          }}>ACTIVE</span>
        )}
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              backgroundColor: t.bgCard,
              borderRadius: '12px',
              width: '400px',
              maxHeight: '500px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${t.border}`,
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '600',
                color: t.text,
              }}>{getPickerLabel()}</h3>
              <p style={{
                margin: '4px 0 0',
                fontSize: '13px',
                color: t.textMuted,
              }}>{getPickerDescription()}</p>
            </div>

            {/* Search */}
            <div style={{ padding: '12px 20px' }}>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  border: `1px solid ${t.border}`,
                  borderRadius: '8px',
                  backgroundColor: t.bgInput,
                  color: t.text,
                  outline: 'none',
                }}
                autoFocus
              />
            </div>

            {/* User List */}
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '0 12px 12px',
            }}>
              {isLoading ? (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: t.textMuted,
                }}>Loading...</div>
              ) : users.length === 0 ? (
                <div style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: t.textMuted,
                }}>No users found</div>
              ) : (
                users.map((user) => {
                  const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
                  return (
                    <button
                      key={user.user_unique_id}
                      onClick={() => handleSelectUser(user)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '4px',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = t.bgHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        backgroundColor: t.bgHover,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        flexShrink: 0,
                      }}>👤</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '500',
                          color: t.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{userName}</div>
                        <div style={{
                          fontSize: '12px',
                          color: t.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{user.email}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: t.bgHover,
                  border: `1px solid ${t.border}`,
                  borderRadius: '6px',
                  color: t.text,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================
// APP LAYOUT WITH SIDEBAR
// ============================================
const AppLayout = () => {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const { user, isAdmin, impersonating, logout, isTrialUser, isTrialExpired } = useAuth();

  // Fetch user data from Supabase based on userId (the viewed user, not necessarily the logged-in user)
  const { data: userData } = useQuery({
    queryKey: ['currentUser', userId],
    queryFn: () => userSettingsService.getCurrentUser(userId),
    enabled: !!userId
  });

  const [currentUser, setCurrentUser] = useState({
    id: userId,
    name: '',
    email: '',
    org: ''
  });

  // Update currentUser when userData is fetched
  useEffect(() => {
    if (userData) {
      setCurrentUser({
        id: userId,
        name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Unknown User',
        email: userData.email || '',
        org: userData.profile_name || ''
      });
    }
  }, [userData, userId]);

  // Validate access: user can only view their own data OR must be admin impersonating
  const impersonatingActive = impersonating.active;
  useEffect(() => {
    if (user && userId && !impersonatingActive) {
      // If not impersonating, redirect to own dashboard if trying to access another user's data
      if (user.id !== userId && !isAdmin) {
        navigate(`/${user.id}/dashboard`, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userId, isAdmin, impersonatingActive]);

  const t = isDark ? themes.dark : themes.light;

  // Determine current page from URL
  const getCurrentPage = () => {
    const path = location.pathname.split('/').slice(2).join('/');
    if (path.startsWith('automations/')) return 'automations';
    if (path.startsWith('accounts/')) return 'accounts';
    return path || 'dashboard';
  };

  const currentPage = getCurrentPage();

  // Navigation items with proper URLs
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: `/${userId}/dashboard` },
    { id: 'reports', label: 'Reports', icon: '📈', path: `/${userId}/reports` },
    { id: 'automations', label: 'Automations', icon: '⚡', path: `/${userId}/automations` },
    { id: 'templates', label: 'Templates', icon: '📝', path: `/${userId}/templates` },
    { id: 'mass-email', label: 'Mass Email', icon: '📧', path: `/${userId}/mass-email` },
    { id: 'accounts', label: 'Accounts', icon: '👥', path: `/${userId}/accounts` },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: `/${userId}/settings` },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Calculate top offset when banners are active
  // Trial expired banner (44px) stacks above impersonation banner (44px)
  const getTopOffset = () => {
    let offset = 0;
    if (isTrialExpired) offset += 44;
    if (impersonating.active) offset += 44;
    return `${offset}px`;
  };
  const topOffset = getTopOffset();

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark, t, themes }}>
      <UserContext.Provider value={{ userId, currentUser, setCurrentUser }}>
        {/* Trial Expired Banner - shows at very top */}
        <TrialExpiredBanner />

        {/* Impersonation Banner - shows below trial banner if both active */}
        <ImpersonationBanner topOffset={isTrialExpired ? '44px' : '0px'} />

        {/* Setup Checklist Floater - shows for all users until setup complete */}
        <SetupChecklistFloater />

        <div style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          backgroundColor: t.bg,
          minHeight: '100vh',
          display: 'flex',
          color: t.text,
          paddingTop: topOffset,
        }}>
          {/* Sidebar */}
          <div style={{
            width: '220px',
            backgroundColor: t.bgSidebar,
            borderRight: `1px solid ${t.border}`,
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            top: topOffset,
            left: 0,
            bottom: 0
          }}>
            {/* Logo */}
            <div style={{
              padding: '20px 16px',
              borderBottom: `1px solid ${t.border}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  backgroundColor: t.primary,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '18px'
                }}>
                  📧
                </div>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: t.text }}>Email Automation</div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>Marketing System</div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: t.textMuted, padding: '8px 12px', textTransform: 'uppercase' }}>
                Navigation
              </div>
              {navItems.map(item => (
                <Link
                  key={item.id}
                  to={item.path}
                  style={{
                    display: 'flex',
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: currentPage === item.id ? `${t.primary}15` : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: currentPage === item.id ? t.primary : t.textSecondary,
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: currentPage === item.id ? '600' : '400',
                    textAlign: 'left',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '2px',
                    textDecoration: 'none'
                  }}
                >
                  <span>{item.icon}</span> {item.label}
                </Link>
              ))}

              <div style={{ fontSize: '10px', fontWeight: '600', color: t.textMuted, padding: '16px 12px 8px', textTransform: 'uppercase' }}>
                Admin
              </div>
              <Link
                to={`/${userId}/timeline`}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: currentPage === 'timeline' ? `${t.primary}15` : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: currentPage === 'timeline' ? t.primary : t.textSecondary,
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                  alignItems: 'center',
                  gap: '10px',
                  textDecoration: 'none'
                }}
              >
                <span>📈</span> Timeline
                <span style={{
                  marginLeft: 'auto',
                  padding: '2px 8px',
                  backgroundColor: t.bgHover,
                  borderRadius: '4px',
                  fontSize: '10px',
                  color: t.textMuted
                }}>Admin</span>
              </Link>

              {/* Impersonation Picker - Only for admins */}
              <ImpersonationPicker t={t} />

              {/* Help & Support Section */}
              <div style={{ fontSize: '10px', fontWeight: '600', color: t.textMuted, padding: '16px 12px 8px', textTransform: 'uppercase' }}>
                Help & Support
              </div>
              <Link
                to={`/${userId}/knowledge-center`}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: currentPage === 'knowledge-center' ? `${t.primary}15` : 'transparent',
                  border: 'none',
                  borderRadius: '8px',
                  color: currentPage === 'knowledge-center' ? t.primary : t.textSecondary,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: currentPage === 'knowledge-center' ? '600' : '400',
                  textAlign: 'left',
                  alignItems: 'center',
                  gap: '10px',
                  textDecoration: 'none',
                  marginBottom: '2px',
                }}
              >
                <span>📚</span> Knowledge Center
              </Link>
            </div>

            {/* User & Logout */}
            <div style={{
              padding: '16px',
              borderTop: `1px solid ${t.border}`,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: t.bgHover,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px'
                }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {impersonating.active ? currentUser.name : user?.name}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {impersonating.active ? currentUser.email : user?.email}
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${t.border}`,
                  borderRadius: '6px',
                  color: t.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1, marginLeft: '220px' }}>
            {/* Top Bar */}
            <div style={{
              padding: '12px 24px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: t.bgCard
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ fontSize: '11px', color: t.textMuted }}>
                  {impersonating.active ? (
                    <span>Viewing as: <strong>{currentUser.name}</strong></span>
                  ) : (
                    <span>User: {userId?.substring(0, 8)}...</span>
                  )}
                </div>
                {/* Scope Filter Dropdown - visible for Master Admins and Agency Admins */}
                <ScopeFilterDropdown t={t} />
              </div>
              <button
                onClick={() => setIsDark(!isDark)}
                style={{
                  padding: '8px 12px',
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
                {isDark ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>

            {/* Page Content - Routes with Suspense for lazy loading */}
            <div style={{ padding: '24px' }}>
              <Suspense fallback={<PageLoader t={t} />}>
                <Routes>
                  <Route path="dashboard" element={<DashboardPage t={t} />} />
                  <Route path="reports" element={<ReportsPage t={t} />} />
                  <Route path="automations" element={<AutomationsPage t={t} />} />
                  <Route path="automations/new" element={<WorkflowBuilderPage t={t} />} />
                  <Route path="automations/master/:defaultKey" element={<WorkflowBuilderPage t={t} />} />
                  <Route path="automations/:automationId" element={<WorkflowBuilderPage t={t} />} />
                  <Route path="templates" element={<TemplatesPage t={t} />} />
                  <Route path="mass-email" element={<MassEmailPage t={t} />} />
                  <Route path="scheduled-emails" element={<ScheduledEmailsPage t={t} />} />
                  <Route path="email-activity" element={<EmailActivityPage t={t} />} />
                  <Route path="accounts" element={<ClientsPage t={t} />} />
                  <Route path="accounts/:accountId" element={<ClientProfilePage t={t} />} />
                  <Route path="settings" element={<SettingsPage t={t} />} />
                  <Route path="knowledge-center" element={<KnowledgeCenterPage t={t} />} />
                  <Route path="timeline" element={<TimelinePage t={t} />} />
                  <Route path="*" element={<DashboardPage t={t} />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </div>
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
};

// ============================================
// PLACEHOLDER PAGES
// ============================================
const TimelinePage = ({ t }) => (
  <div>
    <h1 style={{ fontSize: '24px', fontWeight: '700', color: t.text, marginBottom: '4px' }}>Activity Timeline</h1>
    <p style={{ color: t.textSecondary, fontSize: '14px' }}>View all email activity across your organization</p>
    <div style={{
      marginTop: '24px',
      padding: '60px',
      textAlign: 'center',
      backgroundColor: t.bgCard,
      borderRadius: '12px',
      border: `1px solid ${t.border}`
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
      <p style={{ color: t.textMuted }}>Timeline view coming soon...</p>
    </div>
  </div>
);

// ============================================
// REDIRECT COMPONENT - Now redirects to login or user dashboard
// ============================================
const RedirectToAuth = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && user?.id) {
        navigate(`/${user.id}/dashboard`, { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, user?.id]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
        <div>Loading...</div>
      </div>
    </div>
  );
};

// ============================================
// MAIN APP COMPONENT
// ============================================
const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/oauth-callback" element={
              <Suspense fallback={<div>Loading...</div>}>
                <OAuthCallbackPage />
              </Suspense>
            } />

            {/* Public feedback page - accessed from star rating emails */}
            <Route path="/feedback" element={
              <Suspense fallback={<div>Loading...</div>}>
                <FeedbackPage />
              </Suspense>
            } />

            {/* Public unsubscribe page - accessed from email footer links */}
            <Route path="/unsubscribe" element={
              <Suspense fallback={<div>Loading...</div>}>
                <UnsubscribePage />
              </Suspense>
            } />

            {/* Redirect root based on auth state */}
            <Route path="/" element={<RedirectToAuth />} />

            {/* Protected routes under userId */}
            <Route path="/:userId/*" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};

export default App;
