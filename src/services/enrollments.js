// src/services/enrollments.js
import { supabase } from '../lib/supabase';

export const enrollmentsService = {
  /**
   * Get all enrollments for an automation
   */
  async getByAutomation(automationId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let query = supabase
      .from('automation_enrollments')
      .select(`
        *,
        account:accounts(
          account_unique_id,
          name,
          person_email,
          email,
          primary_contact_first_name,
          primary_contact_last_name
        )
      `)
      .eq('automation_id', automationId)
      .order('enrolled_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get all enrollments for an account
   */
  async getByAccount(accountId, options = {}) {
    const { status } = options;
    
    let query = supabase
      .from('automation_enrollments')
      .select(`
        *,
        automation:automations(id, name, category, status)
      `)
      .eq('account_id', accountId)
      .order('enrolled_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get a single enrollment by ID
   */
  async getById(enrollmentId) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .select(`
        *,
        account:accounts(*),
        automation:automations(*)
      `)
      .eq('id', enrollmentId)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get enrollment stats for an automation
   */
  async getStats(automationId) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .select('status, emails_sent, emails_opened, emails_clicked')
      .eq('automation_id', automationId);
    
    if (error) throw error;

    const stats = {
      total: data.length,
      active: 0,
      completed: 0,
      exited: 0,
      paused: 0,
      totalEmailsSent: 0,
      totalOpens: 0,
      totalClicks: 0
    };

    data.forEach(e => {
      stats[e.status.toLowerCase()]++;
      stats.totalEmailsSent += e.emails_sent || 0;
      stats.totalOpens += e.emails_opened || 0;
      stats.totalClicks += e.emails_clicked || 0;
    });

    return stats;
  },

  /**
   * Check if account can enroll in automation
   */
  async canEnroll(accountId, automationId) {
    const { data, error } = await supabase
      .rpc('can_enroll_in_automation', {
        p_account_id: accountId,
        p_automation_id: automationId
      });
    
    if (error) throw error;
    return data;
  },

  /**
   * Enroll an account in an automation
   */
  async enroll(automationId, accountId, metadata = {}) {
    // Check if can enroll
    const canEnroll = await this.canEnroll(accountId, automationId);
    if (!canEnroll) {
      throw new Error('Account cannot be enrolled in this automation');
    }

    // Get the automation to find the first node
    const { data: automation, error: autoError } = await supabase
      .from('automations')
      .select('nodes')
      .eq('id', automationId)
      .single();
    
    if (autoError) throw autoError;

    const firstNode = automation.nodes?.[0];

    const { data, error } = await supabase
      .from('automation_enrollments')
      .insert({
        automation_id: automationId,
        account_id: accountId,
        status: 'Active',
        current_node_id: firstNode?.id || null,
        metadata
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Bulk enroll multiple accounts
   */
  async bulkEnroll(automationId, accountIds) {
    const results = {
      enrolled: [],
      skipped: [],
      errors: []
    };

    for (const accountId of accountIds) {
      try {
        const canEnroll = await this.canEnroll(accountId, automationId);
        if (canEnroll) {
          const enrollment = await this.enroll(automationId, accountId);
          results.enrolled.push(enrollment);
        } else {
          results.skipped.push(accountId);
        }
      } catch (error) {
        results.errors.push({ accountId, error: error.message });
      }
    }

    return results;
  },

  /**
   * Exit an enrollment
   */
  async exit(enrollmentId, reason = 'manual') {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .update({
        status: 'Exited',
        exit_reason: reason,
        exited_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Pause an enrollment
   */
  async pause(enrollmentId) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .update({
        status: 'Paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Resume a paused enrollment
   */
  async resume(enrollmentId) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .update({
        status: 'Active',
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Complete an enrollment
   */
  async complete(enrollmentId) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .update({
        status: 'Completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update enrollment progress (move to next node)
   */
  async updateProgress(enrollmentId, nodeId, branch = null) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .update({
        current_node_id: nodeId,
        current_branch: branch,
        last_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Set next action time
   */
  async setNextAction(enrollmentId, nextActionAt) {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .update({
        next_action_at: nextActionAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Increment email stats
   */
  async incrementEmailSent(enrollmentId) {
    const { data, error } = await supabase
      .rpc('increment_enrollment_email_sent', { p_enrollment_id: enrollmentId });
    
    if (error) {
      // Fallback if RPC doesn't exist
      const { data: current } = await supabase
        .from('automation_enrollments')
        .select('emails_sent')
        .eq('id', enrollmentId)
        .single();
      
      return supabase
        .from('automation_enrollments')
        .update({ emails_sent: (current?.emails_sent || 0) + 1 })
        .eq('id', enrollmentId);
    }
    return data;
  },

  /**
   * Get enrollments ready for next action
   */
  async getReadyForAction() {
    const { data, error } = await supabase
      .from('automation_enrollments')
      .select(`
        *,
        automation:automations(*),
        account:accounts(*)
      `)
      .eq('status', 'Active')
      .lte('next_action_at', new Date().toISOString())
      .order('next_action_at');
    
    if (error) throw error;
    return data;
  },

  /**
   * Get enrollment history
   */
  async getHistory(enrollmentId) {
    const { data, error } = await supabase
      .from('enrollment_history')
      .select(`
        *,
        email_log:email_logs(id, subject, status, sent_at, first_opened_at, first_clicked_at)
      `)
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  /**
   * Log node execution in history
   */
  async logHistory(enrollmentId, historyEntry) {
    const { data, error } = await supabase
      .from('enrollment_history')
      .insert({
        enrollment_id: enrollmentId,
        ...historyEntry
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

export default enrollmentsService;
