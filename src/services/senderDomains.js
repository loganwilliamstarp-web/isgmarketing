// src/services/senderDomains.js
// Service for managing sender domain authentication with SendGrid
// Allows agency admins to add their own domains for email sending
// Uses Edge Function to keep SendGrid API key secure

import { supabase } from '../lib/supabase';

export const senderDomainsService = {
  /**
   * Call the sender-domains Edge Function
   * @param {string} action - Action to perform
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Response from edge function
   */
  async callEdgeFunction(action, body = {}, authenticatedUserId = null) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/sender-domains?action=${action}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...body, authenticatedUserId })
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Edge function request failed');
    }

    return result;
  },

  /**
   * Get all sender domains for a user
   * @param {string} targetOwnerId - Optional owner ID (for impersonation). If not provided, uses authenticated user.
   * @param {string} authenticatedUserId - The current user's ID from AuthContext (user_unique_id)
   * @returns {Promise<Array>} List of sender domains
   */
  async getAll(targetOwnerId = null, authenticatedUserId = null) {
    const result = await this.callEdgeFunction('list', { targetOwnerId }, authenticatedUserId);
    return result.domains || [];
  },

  /**
   * Get verified domains for a user (for email template from address dropdown)
   * Queries database directly since app uses Salesforce auth (not Supabase auth)
   * RLS is disabled on sender_domains table for this reason
   * @param {string} targetOwnerId - Owner ID to look up domains for
   * @returns {Promise<Array>} List of verified domains with default sender info
   */
  async getVerifiedDomains(targetOwnerId = null) {
    if (!targetOwnerId) {
      return [];
    }

    // Get the user's email domain to match against verified sender domains
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('user_unique_id', targetOwnerId)
      .single();

    if (userError || !userData?.email) {
      console.log('getVerifiedDomains: No user email found for ownerId:', targetOwnerId);
      return [];
    }

    // Extract domain from user's email (e.g., "john@isgdfw.com" -> "isgdfw.com")
    const userEmailDomain = userData.email.split('@')[1]?.toLowerCase();

    if (!userEmailDomain) {
      console.log('getVerifiedDomains: Could not extract domain from email:', userData.email);
      return [];
    }

    console.log('getVerifiedDomains: Looking for verified domains matching:', userEmailDomain);

    // Get verified domains that match the user's email domain
    // Match either exact domain OR subdomains (e.g., mail.isgdfw.com matches isgdfw.com)
    const { data, error } = await supabase
      .from('sender_domains')
      .select('id, domain, default_from_email, default_from_name')
      .eq('status', 'verified')
      .or(`domain.eq.${userEmailDomain},domain.ilike.%.${userEmailDomain}`)
      .order('domain');

    if (error) {
      console.error('getVerifiedDomains error:', error);
      return [];
    }

    console.log('getVerifiedDomains: Found domains:', data?.length || 0, data?.map(d => d.domain));
    return data || [];
  },

  /**
   * Add a new sender domain - initiates SendGrid domain authentication
   * @param {string} domain - Domain to authenticate (e.g., "smithinsurance.com")
   * @param {Object} options - Optional settings (subdomain is optional, defaults to none)
   * @returns {Promise<Object>} Created sender domain with DNS records
   */
  async addDomain(domain, options = {}) {
    const { subdomain } = options;
    const result = await this.callEdgeFunction('add', { domain, subdomain: subdomain || null });
    return result.domain;
  },

  /**
   * Verify a domain - checks if DNS records are properly configured
   * @param {string} domainId - Domain UUID
   * @returns {Promise<Object>} Updated sender domain with verification status
   */
  async verifyDomain(domainId) {
    const result = await this.callEdgeFunction('verify', { domainId });
    return result;
  },

  /**
   * Update default sender info for a domain
   * @param {string} domainId - Domain UUID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated sender domain
   */
  async updateDefaults(domainId, updates) {
    const result = await this.callEdgeFunction('update', { domainId, updates });
    return result.domain;
  },

  /**
   * Delete a sender domain
   * @param {string} domainId - Domain UUID
   */
  async deleteDomain(domainId) {
    await this.callEdgeFunction('delete', { domainId });
  },

  /**
   * Enable inbound parse for reply tracking
   * @param {string} domainId - Domain UUID
   * @param {string} subdomain - Optional subdomain (default: 'parse')
   * @returns {Promise<Object>} Domain with inbound parse config
   */
  async enableInboundParse(domainId, subdomain = 'parse') {
    const result = await this.callEdgeFunction('enable-inbound-parse', { domainId, subdomain });
    return result;
  },

  /**
   * Disable inbound parse for a domain
   * @param {string} domainId - Domain UUID
   * @returns {Promise<Object>} Updated domain
   */
  async disableInboundParse(domainId) {
    const result = await this.callEdgeFunction('disable-inbound-parse', { domainId });
    return result.domain;
  },

  /**
   * Get inbound parse status and configuration
   * @param {string} domainId - Domain UUID
   * @returns {Promise<Object>} Inbound parse status and MX record requirements
   */
  async getInboundParseStatus(domainId) {
    const result = await this.callEdgeFunction('get-inbound-parse-status', { domainId });
    return result;
  }
};

export default senderDomainsService;
