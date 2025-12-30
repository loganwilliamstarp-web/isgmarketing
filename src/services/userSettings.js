// src/services/userSettings.js
import { supabase } from '../lib/supabase';

export const userSettingsService = {
  /**
   * Get settings for a user
   */
  async get(userId) {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  },

  /**
   * Get settings with user info
   */
  async getWithUser(userId) {
    const { data, error } = await supabase
      .from('user_settings')
      .select(`
        *,
        user:users(user_unique_id, email, first_name, last_name, role_name, profile_name)
      `)
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Create settings for a user (usually done by trigger, but manual option)
   */
  async create(userId, settings = {}) {
    const { data, error } = await supabase
      .from('user_settings')
      .insert({
        user_id: userId,
        ...settings
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update user settings
   */
  async update(userId, updates) {
    const { data, error } = await supabase
      .from('user_settings')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update signature settings
   */
  async updateSignature(userId, signature) {
    const { signatureName, signatureTitle, signaturePhone, signatureEmail, signatureMessage } = signature;
    return this.update(userId, {
      signature_name: signatureName,
      signature_title: signatureTitle,
      signature_phone: signaturePhone,
      signature_email: signatureEmail,
      signature_message: signatureMessage
    });
  },

  /**
   * Update agency info
   */
  async updateAgencyInfo(userId, agencyInfo) {
    const { agencyName, agencyAddress, agencyPhone, agencyWebsite } = agencyInfo;
    return this.update(userId, {
      agency_name: agencyName,
      agency_address: agencyAddress,
      agency_phone: agencyPhone,
      agency_website: agencyWebsite
    });
  },

  /**
   * Update email sending settings
   */
  async updateEmailSettings(userId, emailSettings) {
    const { fromName, fromEmail, replyToEmail, defaultSendTime, timezone, dailySendLimit } = emailSettings;
    return this.update(userId, {
      from_name: fromName,
      from_email: fromEmail,
      reply_to_email: replyToEmail,
      default_send_time: defaultSendTime,
      timezone,
      daily_send_limit: dailySendLimit
    });
  },

  /**
   * Update preferences (JSONB field)
   */
  async updatePreferences(userId, preferences) {
    const current = await this.get(userId);
    return this.update(userId, {
      preferences: {
        ...current?.preferences,
        ...preferences
      }
    });
  },

  /**
   * Get current user's info including role
   */
  async getCurrentUser(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id, email, first_name, last_name, role_name, profile_name')
      .eq('user_unique_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Get all user IDs that share the same role as the given user
   */
  async getUserIdsByRole(userId) {
    // First get the current user's role
    const currentUser = await this.getCurrentUser(userId);
    if (!currentUser?.role_name) {
      return [userId]; // Fall back to just the current user
    }

    // Get all users with the same role
    const { data, error } = await supabase
      .from('users')
      .select('user_unique_id')
      .eq('role_name', currentUser.role_name);

    if (error) throw error;

    return data?.map(u => u.user_unique_id) || [userId];
  },

  /**
   * Get signature HTML for email injection
   */
  async getSignatureHtml(userId) {
    const settings = await this.get(userId);
    if (!settings) return '';

    const { signature_name, signature_title, signature_phone, signature_email, signature_message } = settings;
    
    let html = '<table style="margin-top: 20px; font-family: Arial, sans-serif;">';
    html += '<tr><td>';
    
    if (signature_name) {
      html += `<strong style="font-size: 14px;">${signature_name}</strong><br>`;
    }
    if (signature_title) {
      html += `<span style="color: #666;">${signature_title}</span><br>`;
    }
    if (signature_phone) {
      html += `<span>${signature_phone}</span><br>`;
    }
    if (signature_email) {
      html += `<a href="mailto:${signature_email}" style="color: #0066cc;">${signature_email}</a><br>`;
    }
    if (signature_message) {
      html += `<p style="margin-top: 10px; font-style: italic; color: #666;">${signature_message}</p>`;
    }
    
    html += '</td></tr></table>';
    return html;
  },

  /**
   * Get unsubscribe footer HTML
   */
  async getUnsubscribeFooterHtml(userId, emailLogId, automationId = null) {
    const settings = await this.get(userId);
    
    const baseUrl = import.meta.env.VITE_APP_URL || 'https://your-app.com';
    const unsubscribeAutomationUrl = `${baseUrl}/unsubscribe?type=automation&id=${emailLogId}&aid=${automationId}`;
    const unsubscribeAllUrl = `${baseUrl}/unsubscribe?type=all&id=${emailLogId}`;
    
    let html = `
      <table style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; width: 100%; font-family: Arial, sans-serif;">
        <tr>
          <td style="text-align: center; font-size: 12px; color: #666;">
    `;
    
    if (automationId) {
      html += `<a href="${unsubscribeAutomationUrl}" style="color: #666;">Unsubscribe from these emails</a> &nbsp;|&nbsp; `;
    }
    html += `<a href="${unsubscribeAllUrl}" style="color: #666;">Unsubscribe from all emails</a>`;
    
    if (settings?.agency_name || settings?.agency_address) {
      html += '<br><br>';
      if (settings.agency_name) html += settings.agency_name;
      if (settings.agency_address) html += ` | ${settings.agency_address}`;
    }
    
    html += `
          </td>
        </tr>
      </table>
    `;
    
    return html;
  }
};

export default userSettingsService;
