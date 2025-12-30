import React, { useState, createContext, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/queryClient';
import { userSettingsService } from './services/userSettings';

// Import connected pages
import {
  DashboardPage,
  AutomationsPage,
  TemplatesPage,
  ClientsPage,
  ClientProfilePage,
  SettingsPage,
  WorkflowBuilderPage,
  MassEmailPage
} from './pages';

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
// APP LAYOUT WITH SIDEBAR
// ============================================
const AppLayout = () => {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  
  // Fetch user data from Supabase based on userId
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
    { id: 'automations', label: 'Automations', icon: '⚡', path: `/${userId}/automations` },
    { id: 'templates', label: 'Templates', icon: '📝', path: `/${userId}/templates` },
    { id: 'mass-email', label: 'Mass Email', icon: '📧', path: `/${userId}/mass-email` },
    { id: 'accounts', label: 'Accounts', icon: '👥', path: `/${userId}/accounts` },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: `/${userId}/settings` },
  ];

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark, t, themes }}>
      <UserContext.Provider value={{ userId, currentUser, setCurrentUser }}>
        <div style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          backgroundColor: t.bg,
          minHeight: '100vh',
          display: 'flex',
          color: t.text
        }}>
          {/* Sidebar */}
          <div style={{
            width: '220px',
            backgroundColor: t.bgSidebar,
            borderRight: `1px solid ${t.border}`,
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            top: 0,
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
            <div style={{ flex: 1, padding: '12px 8px' }}>
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
            </div>

            {/* User */}
            <div style={{
              padding: '16px',
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
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
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: t.text }}>{currentUser.name}</div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>{currentUser.email}</div>
              </div>
              <Link to={`/${userId}/settings`} style={{ color: t.textMuted, fontSize: '16px', textDecoration: 'none' }}>⚙️</Link>
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
              <div style={{ fontSize: '11px', color: t.textMuted }}>
                User: {userId?.substring(0, 8)}...
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

            {/* Page Content - Routes */}
            <div style={{ padding: '24px' }}>
              <Routes>
                <Route path="dashboard" element={<DashboardPage t={t} />} />
                <Route path="automations" element={<AutomationsPage t={t} />} />
                <Route path="automations/new" element={<WorkflowBuilderPage t={t} />} />
                <Route path="automations/:automationId" element={<WorkflowBuilderPage t={t} />} />
                <Route path="templates" element={<TemplatesPage t={t} />} />
                <Route path="mass-email" element={<MassEmailPage t={t} />} />
                <Route path="accounts" element={<ClientsPage t={t} />} />
                <Route path="accounts/:accountId" element={<ClientProfilePage t={t} />} />
                <Route path="settings" element={<SettingsPage t={t} />} />
                <Route path="timeline" element={<TimelinePage t={t} />} />
                <Route path="*" element={<DashboardPage t={t} />} />
              </Routes>
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
// REDIRECT COMPONENT
// ============================================
const RedirectToUser = () => {
  const navigate = useNavigate();
  useEffect(() => {
    // Demo user ID - in production this would come from Salesforce iframe
    navigate('/0056g000004jvyVAAQ/dashboard');
  }, [navigate]);
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
        <Routes>
          {/* Redirect root to demo user */}
          <Route path="/" element={<RedirectToUser />} />
          
          {/* All routes under userId */}
          <Route path="/:userId/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};

export default App;
