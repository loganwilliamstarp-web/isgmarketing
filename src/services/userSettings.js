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
   * Update user settings (creates record if it doesn't exist)
   */
  async update(userId, updates) {
    // First try to update existing record
    const { data, error } = await supabase
      .from('user_settings')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    // If no row was found, create one
    if (error && error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('user_settings')
        .insert({
          user_id: userId,
          ...updates,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return newData;
    }

    if (error) throw error;
    return data;
  },

  /**
   * Update signature settings
   */
  async updateSignature(userId, signature) {
    const { signature_html } = signature;
    return this.update(userId, {
      signature_html
    });
  },

  /**
   * Update agency info for a single user
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
   * Update agency info for all users in a profile (agency)
   * Used by agency admins to update settings for their entire agency
   * Creates user_settings records for users who don't have one yet
   */
  async updateAgencyInfoByProfile(profileName, agencyInfo) {
    const { agency_name, agency_address, agency_phone, agency_website } = agencyInfo;

    // First, get all user IDs in this profile
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('user_unique_id')
      .eq('profile_name', profileName);

    if (usersError) throw usersError;
    if (!users || users.length === 0) return null;

    const userIds = users.map(u => u.user_unique_id);
    const now = new Date().toISOString();

    // Upsert all user_settings for these users (creates if not exists, updates if exists)
    const upsertData = userIds.map(userId => ({
      user_id: userId,
      agency_name,
      agency_address,
      agency_phone,
      agency_website,
      created_at: now,
      updated_at: now
    }));

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(upsertData, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select();

    if (error) throw error;
    return data;
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

    // Use the custom HTML signature if available
    if (settings.signature_html) {
      return `<div style="margin-top: 20px; font-family: Arial, sans-serif;">${settings.signature_html}</div>`;
    }

    return '';
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
