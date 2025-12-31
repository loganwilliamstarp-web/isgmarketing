// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';

const AuthContext = createContext();

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
  const [user, setUser] = useState(null); // { id, name, email }
  const [isAdmin, setIsAdmin] = useState(false);
  const [impersonating, setImpersonating] = useState({
    active: false,
    originalUserId: null,
    originalUserName: null,
    targetUserId: null,
    targetUserName: null,
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
    });
    setIsAuthenticated(true);

    // Check if user is admin
    const adminStatus = await authService.isAdmin(userData.user_unique_id);
    setIsAdmin(adminStatus);

    // Check for saved impersonation state
    const savedImpersonation = localStorage.getItem('isg_impersonation');
    if (savedImpersonation && adminStatus) {
      const parsed = JSON.parse(savedImpersonation);
      if (parsed.originalUserId === userData.user_unique_id) {
        setImpersonating(parsed);
      } else {
        localStorage.removeItem('isg_impersonation');
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
  };

  const impersonate = useCallback((targetUserId, targetUserName) => {
    if (!isAdmin || !user) return false;

    const newImpersonation = {
      active: true,
      originalUserId: user.id,
      originalUserName: user.name,
      targetUserId,
      targetUserName,
    };

    setImpersonating(newImpersonation);
    localStorage.setItem('isg_impersonation', JSON.stringify(newImpersonation));
    return true;
  }, [isAdmin, user]);

  const exitImpersonation = useCallback(() => {
    localStorage.removeItem('isg_impersonation');
    setImpersonating({
      active: false,
      originalUserId: null,
      originalUserName: null,
      targetUserId: null,
      targetUserName: null,
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

  const value = {
    isLoading,
    isAuthenticated,
    user,
    isAdmin,
    impersonating,
    sendOTP,
    verifyOTP,
    logout,
    impersonate,
    exitImpersonation,
    getEffectiveUserId,
    getEffectiveUserName,
    checkSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
