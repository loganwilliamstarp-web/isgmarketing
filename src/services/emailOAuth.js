// src/services/emailOAuth.js
// Service for managing Gmail and Microsoft 365 OAuth connections
// Connections are at the agency level (profile_name) - one connection per agency
// Used for inbox injection feature - replies are injected into agency's shared inbox

import { supabase } from '../lib/supabase';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-oauth`;

// Store popup reference and callbacks
let oauthPopup = null;
let oauthCallback = null;

// Listen for messages from popup window
if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    // Verify origin matches our frontend
    const allowedOrigins = [
      window.location.origin,
      import.meta.env.VITE_FRONTEND_URL,
      'https://app.isgmarketing.com',
      'https://isgmarketing-production.up.railway.app'
    ].filter(Boolean);

    if (!allowedOrigins.includes(event.origin)) return;

    if (event.data?.type === 'oauth_complete') {
      if (oauthCallback) {
        oauthCallback(event.data);
        oauthCallback = null;
      }
      if (oauthPopup && !oauthPopup.closed) {
        oauthPopup.close();
      }
      oauthPopup = null;
    }
  });
}

export const emailOAuthService = {
  /**
   * Initiate OAuth flow in a popup window
   * @param {string} provider - 'gmail' or 'microsoft'
   * @param {string} agencyId - Agency ID (profile_name) for agency-level connection
   * @returns {Promise<Object>} Result of OAuth flow
   */
  initiateOAuth(provider, agencyId) {
    return new Promise((resolve, reject) => {
      const state = JSON.stringify({
        agency_id: agencyId,
        redirect_after: '/oauth-callback',
        popup: true
      });

      const url = `${EDGE_FUNCTION_URL}?action=initiate&provider=${provider}&state=${encodeURIComponent(state)}`;

      // Calculate popup position (centered)
      const width = 500;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      // Close existing popup if any
      if (oauthPopup && !oauthPopup.closed) {
        oauthPopup.close();
      }

      // Open popup
      oauthPopup = window.open(
        url,
        'oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      if (!oauthPopup) {
        reject(new Error('Popup was blocked. Please allow popups for this site.'));
        return;
      }

      // Set up callback
      oauthCallback = (data) => {
        if (data.success) {
          resolve({ success: true, provider: data.provider });
        } else {
          reject(new Error(data.error || 'OAuth failed'));
        }
      };

      // Check if popup was closed without completing
      const checkClosed = setInterval(() => {
        if (oauthPopup?.closed) {
          clearInterval(checkClosed);
          if (oauthCallback) {
            oauthCallback = null;
            // Don't reject - user may have completed OAuth before closing
            // The message handler will have already resolved if successful
          }
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
        if (oauthCallback) {
          oauthCallback = null;
          if (oauthPopup && !oauthPopup.closed) {
            oauthPopup.close();
          }
          reject(new Error('OAuth timed out'));
        }
      }, 5 * 60 * 1000);
    });
  },

  /**
   * Get OAuth connection status for an agency (by profile_name)
   * @param {string} agencyId - Agency ID (profile_name)
   * @returns {Promise<Object>} Connection status for gmail and microsoft
   */
  async getConnectionsByAgency(agencyId) {
    console.log('[emailOAuth] getConnectionsByAgency called with:', agencyId);
    if (!agencyId) {
      console.log('[emailOAuth] No agencyId provided');
      return { gmail: null, microsoft: null };
    }

    console.log('[emailOAuth] Querying email_provider_connections where agency_id =', agencyId);
    const { data, error } = await supabase
      .from('email_provider_connections')
      .select('provider, provider_email, status, last_error, last_used_at, created_at, updated_at, agency_id')
      .eq('agency_id', agencyId);

    console.log('[emailOAuth] Query result - data:', data, 'error:', error);

    if (error) {
      console.error('Error fetching OAuth connections:', error);
      throw error;
    }

    // Format response
    const connections = {
      gmail: null,
      microsoft: null
    };

    for (const conn of data || []) {
      connections[conn.provider] = {
        email: conn.provider_email,
        status: conn.status,
        lastError: conn.last_error,
        lastUsedAt: conn.last_used_at,
        connectedAt: conn.created_at,
        updatedAt: conn.updated_at
      };
    }

    return connections;
  },

  /**
   * Get OAuth connection status for a user (legacy - uses owner_id)
   * @deprecated Use getConnectionsByAgency instead
   * @param {string} ownerId - User's owner ID
   * @returns {Promise<Object>} Connection status for gmail and microsoft
   */
  async getConnections(ownerId) {
    if (!ownerId) {
      return { gmail: null, microsoft: null };
    }

    const { data, error } = await supabase
      .from('email_provider_connections')
      .select('provider, provider_email, status, last_error, last_used_at, created_at, updated_at')
      .eq('owner_id', ownerId);

    if (error) {
      console.error('Error fetching OAuth connections:', error);
      throw error;
    }

    // Format response
    const connections = {
      gmail: null,
      microsoft: null
    };

    for (const conn of data || []) {
      connections[conn.provider] = {
        email: conn.provider_email,
        status: conn.status,
        lastError: conn.last_error,
        lastUsedAt: conn.last_used_at,
        connectedAt: conn.created_at,
        updatedAt: conn.updated_at
      };
    }

    return connections;
  },

  /**
   * Disconnect an OAuth provider for an agency
   * @param {string} provider - 'gmail' or 'microsoft'
   * @param {string} agencyId - Agency ID (profile_name)
   * @returns {Promise<Object>} Result of disconnect operation
   */
  async disconnect(provider, agencyId) {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${EDGE_FUNCTION_URL}?action=disconnect&provider=${provider}`, {
      method: 'POST',
      headers: {
        'Authorization': session ? `Bearer ${session.access_token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agency_id: agencyId })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to disconnect');
    }

    return result;
  },

  /**
   * Manually refresh an OAuth token
   * @param {string} provider - 'gmail' or 'microsoft'
   * @param {string} agencyId - Agency ID (profile_name)
   * @returns {Promise<Object>} Result of refresh operation
   */
  async refreshToken(provider, agencyId) {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${EDGE_FUNCTION_URL}?action=refresh&provider=${provider}`, {
      method: 'POST',
      headers: {
        'Authorization': session ? `Bearer ${session.access_token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agency_id: agencyId })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to refresh token');
    }

    return result;
  },

  /**
   * Check if agency has any active OAuth connection
   * @param {string} agencyId - Agency ID (profile_name)
   * @returns {Promise<boolean>} True if agency has at least one active connection
   */
  async hasActiveConnection(agencyId) {
    if (!agencyId) return false;

    const { data, error } = await supabase
      .from('email_provider_connections')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .limit(1);

    if (error) {
      console.error('Error checking OAuth connection:', error);
      return false;
    }

    return data && data.length > 0;
  }
};

export default emailOAuthService;
