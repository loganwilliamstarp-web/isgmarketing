// src/services/emailOAuth.js
// Service for managing Gmail and Microsoft 365 OAuth connections
// Used for inbox injection feature - replies are injected into user's actual inbox

import { supabase } from '../lib/supabase';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-oauth`;

export const emailOAuthService = {
  /**
   * Initiate OAuth flow - redirects to provider's authorization page
   * @param {string} provider - 'gmail' or 'microsoft'
   * @param {string} ownerId - User's owner ID (Salesforce user ID)
   * @param {string} redirectAfter - Path to redirect after OAuth completes
   */
  initiateOAuth(provider, ownerId, redirectAfter = '/settings?tab=integrations') {
    const state = JSON.stringify({
      owner_id: ownerId,
      redirect_after: redirectAfter
    });
    const url = `${EDGE_FUNCTION_URL}?action=initiate&provider=${provider}&state=${encodeURIComponent(state)}`;
    window.location.href = url;
  },

  /**
   * Get OAuth connection status for a user
   * Queries database directly (for Salesforce auth users)
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
   * Disconnect an OAuth provider
   * @param {string} provider - 'gmail' or 'microsoft'
   * @param {string} ownerId - User's owner ID
   * @returns {Promise<Object>} Result of disconnect operation
   */
  async disconnect(provider, ownerId) {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${EDGE_FUNCTION_URL}?action=disconnect&provider=${provider}`, {
      method: 'POST',
      headers: {
        'Authorization': session ? `Bearer ${session.access_token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ owner_id: ownerId })
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
   * @param {string} ownerId - User's owner ID
   * @returns {Promise<Object>} Result of refresh operation
   */
  async refreshToken(provider, ownerId) {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${EDGE_FUNCTION_URL}?action=refresh&provider=${provider}`, {
      method: 'POST',
      headers: {
        'Authorization': session ? `Bearer ${session.access_token}` : '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ owner_id: ownerId })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to refresh token');
    }

    return result;
  },

  /**
   * Check if user has any active OAuth connection
   * @param {string} ownerId - User's owner ID
   * @returns {Promise<boolean>} True if user has at least one active connection
   */
  async hasActiveConnection(ownerId) {
    if (!ownerId) return false;

    const { data, error } = await supabase
      .from('email_provider_connections')
      .select('id')
      .eq('owner_id', ownerId)
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
