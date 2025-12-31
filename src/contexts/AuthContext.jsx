// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';

const AuthContext = createContext();

// User role constants
export const USER_ROLES = {
  MASTER_ADMIN: 'master_admin',
  AGENCY_ADMIN: 'agency_admin',
  MARKETING_USER: 'marketing_user',
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null); // { id, name, email, profileName }
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAgencyAdmin, setIsAgencyAdmin] = useState(false);
  const [userRole, setUserRole] = useState(null); // 'master_admin' | 'agency_admin' | 'marketing_user'
  const [impersonating, setImpersonating] = useState({
    active: false,
    originalUserId: null,
    originalUserName: null,
    targetUserId: null,
    targetUserName: null,
    targetProfileName: null,
  });

  // Scope filter state - for filtering data site-wide
  const [scopeFilter, setScopeFilter] = useState({
    active: false,
    filterType: null, // 'agency' | 'agent' | 'all_agencies' | 'all_agents'
    filterValue: null, // profile_name for agency, user_id for agent, null for all
    filterLabel: null, // Display name
    ownerIds: null, // Array of owner IDs to query (populated when filter changes)
  });

  // Check for existing session on mount - handles both Salesforce and OTP auth
  useEffect(() => {
    initializeAuth();

    // Listen for Supabase auth state changes (OTP flow)
    const { data: { subscription } } = authService.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUser(null);
        setIsAdmin(false);
        setImpersonating({
          active: false,
          originalUserId: null,
          originalUserName: null,
          targetUserId: null,
          targetUserName: null,
        });
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  /**
   * Initialize authentication - checks for Salesforce context first, then OTP session
   */
  const initializeAuth = async () => {
    setIsLoading(true);
    try {
      // Step 1: Check for Salesforce context (iframe with params)
      const sfContext = authService.detectSalesforceContext();

      if (sfContext.isFromSalesforce) {
        // We're coming from Salesforce - auto-authenticate
        const authenticated = await handleSalesforceAuth(sfContext);
        if (authenticated) {
          setIsLoading(false);
          return;
        }
        // If SF auth failed, fall through to check other methods
      }

      // Step 2: Check for existing local session (from previous SF auth)
      const localSession = authService.getLocalSession();
      if (localSession) {
        // Verify user still exists in users table
        const userData = await authService.getUserById(localSession.userId);
        if (userData) {
          await setUserFromData(userData);
          setIsLoading(false);
          return;
        }
        // User no longer valid - clear session
        authService.clearLocalSession();
      }

      // Step 3: Check for Supabase OTP session
      await checkSession();
    } catch (error) {
      console.error('Auth initialization error:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle authentication from Salesforce iframe context
   */
  const handleSalesforceAuth = async (sfContext) => {
    try {
      const { userId, sessionId, orgId, isSalesforceReferrer, isInIframe } = sfContext;

      // If we have session params, validate them
      if (sessionId && orgId) {
        const sfUserInfo = await authService.validateSalesforceSession(sessionId, orgId);
        if (sfUserInfo) {
          // Session is valid - check if user exists in our users table
          const userData = await authService.getUserById(sfUserInfo.userId);
          if (userData) {
            authService.createLocalSession(userData);
            await setUserFromData(userData);
            return true;
          }
        }
      }

      // Alternative: Trust iframe + referrer combo (less secure but simpler)
      if (isInIframe && isSalesforceReferrer && userId) {
        const userData = await authService.getUserById(userId);
        if (userData) {
          authService.createLocalSession(userData);
          await setUserFromData(userData);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Salesforce auth error:', error);
      return false;
    }
  };

  /**
   * Set user state from user data
   */
  const setUserFromData = async (userData) => {
    const userName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User';
    setUser({
      id: userData.user_unique_id,
      name: userName,
      email: userData.email,
      profileName: userData.profile_name || null,
    });
    setIsAuthenticated(true);

    // Check if user is admin (Master Admin)
    const adminStatus = await authService.isAdmin(userData.user_unique_id);
    setIsAdmin(adminStatus);

    // Check if user is agency admin
    const agencyAdminStatus = userData.marketing_cloud_agency_admin === true;
    setIsAgencyAdmin(agencyAdminStatus);

    // Determine user role (priority: Master Admin > Agency Admin > Marketing User)
    let role;
    if (adminStatus) {
      role = USER_ROLES.MASTER_ADMIN;
    } else if (agencyAdminStatus) {
      role = USER_ROLES.AGENCY_ADMIN;
    } else {
      role = USER_ROLES.MARKETING_USER;
    }
    setUserRole(role);

    // Check for saved impersonation state (only admins and agency admins can impersonate)
    const savedImpersonation = localStorage.getItem('isg_impersonation');
    if (savedImpersonation && (adminStatus || agencyAdminStatus)) {
      const parsed = JSON.parse(savedImpersonation);
      if (parsed.originalUserId === userData.user_unique_id) {
        setImpersonating(parsed);
      } else {
        localStorage.removeItem('isg_impersonation');
      }
    }

    // Check for saved scope filter state
    const savedScopeFilter = localStorage.getItem('isg_scope_filter');
    if (savedScopeFilter && (adminStatus || agencyAdminStatus)) {
      const parsed = JSON.parse(savedScopeFilter);
      // Verify the filter is still valid for this user
      if (parsed.originalUserId === userData.user_unique_id) {
        setScopeFilter(parsed);
      } else {
        localStorage.removeItem('isg_scope_filter');
      }
    }
  };

  /**
   * Check for Supabase OTP session
   */
  const checkSession = async () => {
    try {
      const session = await authService.getSession();

      if (session?.user?.email) {
        // Verify user exists in users table
        const userData = await authService.getUserByEmail(session.user.email);

        if (userData) {
          await setUserFromData(userData);
        } else {
          // User authenticated but not in users table - sign them out
          await authService.signOut();
          setIsAuthenticated(false);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const sendOTP = async (email) => {
    await authService.sendOTP(email);
    authService.saveLastEmail(email);
  };

  const verifyOTP = async (email, code) => {
    const result = await authService.verifyOTP(email, code);

    // Check if user exists in users table
    const userData = await authService.getUserByEmail(email);

    if (!userData) {
      // User verified email but doesn't have access
      await authService.signOut();
      return { success: false, noAccess: true };
    }

    const userName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User';
    setUser({
      id: userData.user_unique_id,
      name: userName,
      email: userData.email,
    });
    setIsAuthenticated(true);

    // Check admin status
    const adminStatus = await authService.isAdmin(userData.user_unique_id);
    setIsAdmin(adminStatus);

    return {
      success: true,
      userId: userData.user_unique_id,
      noAccess: false
    };
  };

  const logout = async () => {
    // Clear both Supabase and local sessions
    await authService.signOut();
    authService.clearLocalSession();
    localStorage.removeItem('isg_impersonation');
    localStorage.removeItem('isg_scope_filter');
    setIsAuthenticated(false);
    setUser(null);
    setIsAdmin(false);
    setIsAgencyAdmin(false);
    setUserRole(null);
    setImpersonating({
      active: false,
      originalUserId: null,
      originalUserName: null,
      targetUserId: null,
      targetUserName: null,
      targetProfileName: null,
    });
    setScopeFilter({
      active: false,
      filterType: null,
      filterValue: null,
      filterLabel: null,
      ownerIds: null,
    });
  };

  const impersonate = useCallback((targetUserId, targetUserName, targetProfileName = null) => {
    // Both Master Admins and Agency Admins can impersonate
    if ((!isAdmin && !isAgencyAdmin) || !user) return false;

    const newImpersonation = {
      active: true,
      originalUserId: user.id,
      originalUserName: user.name,
      targetUserId,
      targetUserName,
      targetProfileName,
    };

    setImpersonating(newImpersonation);
    localStorage.setItem('isg_impersonation', JSON.stringify(newImpersonation));
    return true;
  }, [isAdmin, isAgencyAdmin, user]);

  const exitImpersonation = useCallback(() => {
    localStorage.removeItem('isg_impersonation');
    setImpersonating({
      active: false,
      originalUserId: null,
      originalUserName: null,
      targetUserId: null,
      targetUserName: null,
      targetProfileName: null,
    });
  }, []);

  // Returns the effective user ID (impersonated if active, otherwise real)
  const getEffectiveUserId = useCallback(() => {
    if (impersonating.active && impersonating.targetUserId) {
      return impersonating.targetUserId;
    }
    return user?.id || null;
  }, [impersonating, user]);

  const getEffectiveUserName = useCallback(() => {
    if (impersonating.active && impersonating.targetUserName) {
      return impersonating.targetUserName;
    }
    return user?.name || null;
  }, [impersonating, user]);

  /**
   * Update the scope filter and persist to localStorage
   * @param {Object} newFilter - { filterType, filterValue, filterLabel, ownerIds }
   */
  const updateScopeFilter = useCallback((newFilter) => {
    if (!user) return;

    const filterState = {
      active: newFilter.filterType !== null,
      filterType: newFilter.filterType,
      filterValue: newFilter.filterValue,
      filterLabel: newFilter.filterLabel,
      ownerIds: newFilter.ownerIds,
      originalUserId: user.id,
    };

    setScopeFilter(filterState);

    if (filterState.active) {
      localStorage.setItem('isg_scope_filter', JSON.stringify(filterState));
    } else {
      localStorage.removeItem('isg_scope_filter');
    }
  }, [user]);

  /**
   * Clear the scope filter
   */
  const clearScopeFilter = useCallback(() => {
    localStorage.removeItem('isg_scope_filter');
    setScopeFilter({
      active: false,
      filterType: null,
      filterValue: null,
      filterLabel: null,
      ownerIds: null,
    });
  }, []);

  /**
   * Get the effective owner IDs for data queries based on current filter state
   * Returns: single user ID (string) or array of user IDs
   */
  const getEffectiveOwnerIds = useCallback(() => {
    // If impersonating a specific user, use that user's ID (single)
    if (impersonating.active && impersonating.targetUserId) {
      return impersonating.targetUserId;
    }

    // If scope filter is active with specific ownerIds, use those
    if (scopeFilter.active && scopeFilter.ownerIds && scopeFilter.ownerIds.length > 0) {
      // If only one owner, return as string for backwards compatibility
      if (scopeFilter.ownerIds.length === 1) {
        return scopeFilter.ownerIds[0];
      }
      return scopeFilter.ownerIds;
    }

    // Default: return current user's ID
    return user?.id || null;
  }, [impersonating, scopeFilter, user]);

  /**
   * Check if the current view is filtered (showing more than just own data)
   */
  const isViewingFiltered = useCallback(() => {
    return scopeFilter.active || impersonating.active;
  }, [scopeFilter, impersonating]);

  const value = {
    isLoading,
    isAuthenticated,
    user,
    isAdmin,
    isAgencyAdmin,
    userRole,
    impersonating,
    scopeFilter,
    sendOTP,
    verifyOTP,
    logout,
    impersonate,
    exitImpersonation,
    getEffectiveUserId,
    getEffectiveUserName,
    updateScopeFilter,
    clearScopeFilter,
    getEffectiveOwnerIds,
    isViewingFiltered,
    checkSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
