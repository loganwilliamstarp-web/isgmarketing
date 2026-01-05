// src/services/unsubscribes.js
import { supabase } from '../lib/supabase';

export const unsubscribesService = {
  /**
   * Get all unsubscribes
   */
  async getAll(options = {}) {
    const { type, isActive = true, limit = 50, offset = 0 } = options;
    
    let query = supabase
      .from('unsubscribes')
      .select(`
        *,
        account:accounts(account_unique_id, name, person_email),
        automation:automations(id, name)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (type) {
      query = query.eq('unsubscribe_type', type);
    }
    
    if (typeof isActive === 'boolean') {
      query = query.eq('is_active', isActive);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get unsubscribes for an email
   */
  async getByEmail(email) {
    const { data, error } = await supabase
      .from('unsubscribes')
      .select(`
        *,
        automation:automations(id, name)
      `)
      .eq('email', email)
      .eq('is_active', true);
    
    if (error) throw error;
    return data;
  },

  /**
   * Check if email is suppressed
   */
  async isEmailSuppressed(email, automationId = null) {
    const { data, error } = await supabase
      .rpc('is_email_suppressed', {
        p_email: email,
        p_automation_id: automationId
      });
    
    if (error) throw error;
    return data;
  },

  /**
   * Check suppression for multiple emails
   */
  async checkBulkSuppression(emails, automationId = null) {
    const results = {};
    
    for (const email of emails) {
      results[email] = await this.isEmailSuppressed(email, automationId);
    }
    
    return results;
  },

  /**
   * Unsubscribe from all emails
   */
  async unsubscribeAll(email, source = 'manual', emailLogId = null) {
    const { data, error } = await supabase
      .from('unsubscribes')
      .insert({
        email,
        unsubscribe_type: 'all',
        source,
        email_log_id: emailLogId,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      // Check if already exists
      if (error.code === '23505') { // Unique violation
        return this.getByEmail(email).then(data => data.find(u => u.unsubscribe_type === 'all'));
      }
      throw error;
    }
    return data;
  },

  /**
   * Unsubscribe from specific automation
   */
  async unsubscribeAutomation(email, automationId, source = 'manual', emailLogId = null) {
    const { data, error } = await supabase
      .from('unsubscribes')
      .insert({
        email,
        unsubscribe_type: 'automation',
        automation_id: automationId,
        source,
        email_log_id: emailLogId,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return this.getByEmail(email).then(data => 
          data.find(u => u.unsubscribe_type === 'automation' && u.automation_id === automationId)
        );
      }
      throw error;
    }
    return data;
  },

  /**
   * Resubscribe (reactivate) an email
   */
  async resubscribe(unsubscribeId) {
    const { data, error } = await supabase
      .from('unsubscribes')
      .update({
        is_active: false,
        resubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', unsubscribeId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Resubscribe all for an email
   */
  async resubscribeAll(email) {
    const { data, error } = await supabase
      .from('unsubscribes')
      .update({
        is_active: false,
        resubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('email', email)
      .eq('is_active', true)
      .select();
    
    if (error) throw error;
    return data;
  },

  /**
   * Process unsubscribe from link click
   */
  async processUnsubscribe(type, emailLogId, ipAddress = null, userAgent = null) {
    // Get email log to find email address
    const { data: emailLog, error: logError } = await supabase
      .from('email_logs')
      .select('to_email, automation_id, account_id')
      .eq('id', emailLogId)
      .single();
    
    if (logError) throw logError;
    
    if (type === 'all') {
      return this.unsubscribeAll(
        emailLog.to_email,
        'link_click',
        emailLogId
      );
    } else if (type === 'automation' && emailLog.automation_id) {
      return this.unsubscribeAutomation(
        emailLog.to_email,
        emailLog.automation_id,
        'link_click',
        emailLogId
      );
    }
  },

  /**
   * Get unsubscribe stats
   */
  async getStats() {
    const { data, error } = await supabase
      .from('unsubscribes')
      .select('unsubscribe_type, is_active, source')
      .eq('is_active', true);
    
    if (error) throw error;

    const stats = {
      total: data.length,
      byType: {
        all: data.filter(u => u.unsubscribe_type === 'all').length,
        automation: data.filter(u => u.unsubscribe_type === 'automation').length
      },
      bySource: {}
    };

    data.forEach(u => {
      const source = u.source || 'unknown';
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
    });

    return stats;
  },

  /**
   * Export unsubscribes list
   */
  async export() {
    const { data, error } = await supabase
      .from('unsubscribes')
      .select(`
        email,
        unsubscribe_type,
        automation:automations(name),
        source,
        created_at
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
};

export default unsubscribesService;
