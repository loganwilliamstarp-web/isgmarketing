// src/services/auth.js
import { supabase } from '../lib/supabase';

// Salesforce instance URLs for validation
const SF_INSTANCE_URLS = [
  'https://isgdfw.my.salesforce.com',
  'https://login.salesforce.com',
  'https://test.salesforce.com'
];

export const authService = {
  /**
   * Check if we're in a Salesforce iframe context
   * Returns { isFromSalesforce, userId, sessionId, orgId } or null
   */
  detectSalesforceContext() {
    // Check URL params for Salesforce context
    const urlParams = new URLSearchParams(window.location.search);
    const sfSession = urlParams.get('sfSession');
    const sfOrg = urlParams.get('sfOrg');

    // Get userId from URL path (e.g., /0056g000004jvyVAAQ/dashboard)
    const pathMatch = window.location.pathname.match(/^\/([a-zA-Z0-9]{15,18})/);
    const urlUserId = pathMatch ? pathMatch[1] : null;

    // Check if we're in an iframe
    const isInIframe = window.self !== window.top;

    // Check referrer for Salesforce domains
    const referrer = document.referrer || '';
    const isSalesforceReferrer =
      referrer.includes('.salesforce.com') ||
      referrer.includes('.force.com') ||
      referrer.includes('.lightning.force.com') ||
      referrer.includes('.my.salesforce.com');

    // If we have session params and valid userId, this is from Salesforce
    if (sfSession && sfOrg && urlUserId) {
      return {
        isFromSalesforce: true,
        userId: urlUserId,
        sessionId: sfSession,
        orgId: sfOrg,
        isInIframe,
        isSalesforceReferrer
      };
    }

    // Alternative: iframe + salesforce referrer + valid userId in URL
    if (isInIframe && isSalesforceReferrer && urlUserId) {
      return {
        isFromSalesforce: true,
        userId: urlUserId,
        sessionId: null, // No session to validate, but trusted via referrer
        orgId: null,
        isInIframe,
        isSalesforceReferrer
      };
    }

    return {
      isFromSalesforce: false,
      userId: urlUserId,
      sessionId: null,
      orgId: null,
      isInIframe,
      isSalesforceReferrer
    };
  },

  /**
   * Validate Salesforce session by calling SF API
   * This proves the session is real and gets user info
   */
  async validateSalesforceSession(sessionId, orgId) {
    if (!sessionId || !orgId) return null;

    try {
      // Determine the instance URL based on org ID
      // For production, you'd want to use the actual instance URL
      const instanceUrl = `https://${orgId.substring(0, 15)}.my.salesforce.com`;

      // Call Salesforce identity endpoint to validate session
      const response = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      });

      if (!response.ok) {
        console.warn('Salesforce session validation failed:', response.status);
        return null;
      }

      const userInfo = await response.json();
      return {
        userId: userInfo.user_id,
        email: userInfo.email,
        name: userInfo.name,
        orgId: userInfo.organization_id
      };
    } catch (error) {
      console.warn('Salesforce session validation error:', error);
      return null;
    }
  },

  /**
   * Get user from users table by Salesforce user ID
   */
  async getUserById(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name')
      .eq('user_unique_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Create a local session for Salesforce-authenticated users
   * Stores auth state in localStorage (not Supabase Auth)
   */
  createLocalSession(userData) {
    const session = {
      userId: userData.user_unique_id,
      email: userData.email,
      name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User',
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      source: 'salesforce'
    };
    localStorage.setItem('isg_sf_session', JSON.stringify(session));
    return session;
  },

  /**
   * Get local Salesforce session if valid
   */
  getLocalSession() {
    const stored = localStorage.getItem('isg_sf_session');
    if (!stored) return null;

    try {
      const session = JSON.parse(stored);
      if (session.expiresAt > Date.now()) {
        return session;
      }
      // Expired - clear it
      localStorage.removeItem('isg_sf_session');
      return null;
    } catch {
      localStorage.removeItem('isg_sf_session');
      return null;
    }
  },

  /**
   * Clear local session
   */
  clearLocalSession() {
    localStorage.removeItem('isg_sf_session');
  },

  /**
   * Send OTP code to email
   * Note: We allow user creation in Supabase Auth, but validate against
   * our users table after verification to control access
   */
  async sendOTP(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true, // Allow creation, we validate against users table after OTP
      }
    });

    if (error) throw error;
    return true;
  },

  /**
   * Verify OTP code and establish session
   */
  async verifyOTP(email, token) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });

    if (error) throw error;
    return data;
  },

  /**
   * Get user from users table by email
   * Returns null if user doesn't exist (no access)
   */
  async getUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  },

  /**
   * Get current Supabase auth session
   */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  /**
   * Sign out and clear session
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return true;
  },

  /**
   * Listen for auth state changes
   */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },

  /**
   * Check if a user is an admin (exists in admin_users table)
   */
  async isAdmin(userId) {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  /**
   * Store last used email in localStorage
   */
  saveLastEmail(email) {
    localStorage.setItem('isg_last_email', email);
  },

  /**
   * Get last used email from localStorage
   */
  getLastEmail() {
    return localStorage.getItem('isg_last_email');
  },

  /**
   * Clear last email from localStorage
   */
  clearLastEmail() {
    localStorage.removeItem('isg_last_email');
  }
};

export default authService;
