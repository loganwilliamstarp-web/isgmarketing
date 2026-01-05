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
  async callEdgeFunction(action, body = {}) {
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
        body: JSON.stringify(body)
      }
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Edge function request failed');
    }

    return result;
  },

  /**
   * Get all sender domains for the current user
   * @returns {Promise<Array>} List of sender domains
   */
  async getAll() {
    const result = await this.callEdgeFunction('list');
    return result.domains || [];
  },

  /**
   * Get verified domains for the current user (for email template from address dropdown)
   * @returns {Promise<Array>} List of verified domains with default sender info
   */
  async getVerifiedDomains() {
    const result = await this.callEdgeFunction('verified');
    return result.domains || [];
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
  }
};

export default senderDomainsService;
