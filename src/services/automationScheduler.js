// src/services/automationScheduler.js
// Automation Scheduler Service
// Handles pre-calculating and scheduling emails for automations
// Uses the approach of scheduling ALL qualifying dates at activation time
// with 24-hour pre-send verification to ensure accounts still qualify

import { supabase } from '../lib/supabase';
import { massEmailsService } from './massEmails';

// Fields that represent trigger dates for automations
const DATE_TRIGGER_FIELDS = {
  policy_expiration: {
    table: 'policies',
    dateField: 'expiration_date',
    joinField: 'account_id',
    statusFilter: { field: 'policy_status', value: 'Active' }
  },
  policy_effective: {
    table: 'policies',
    dateField: 'effective_date',
    joinField: 'account_id',
    statusFilter: { field: 'policy_status', value: 'Active' }
  },
  account_created: {
    table: 'accounts',
    dateField: 'created_at',
    joinField: 'account_unique_id'
  }
};

export const automationSchedulerService = {
  /**
   * Daily refresh for all active automations
   * Finds new qualifying accounts and adds them to schedules
   * Should be called via cron job (e.g., daily at 2am)
   * @returns {Promise<{automationsProcessed: number, totalAdded: number, totalRemoved: number, errors: string[]}>}
   */
  async dailyRefresh() {
    const errors = [];
    let automationsProcessed = 0;
    let totalAdded = 0;
    let totalRemoved = 0;

    // Get all active automations
    const { data: automations, error } = await supabase
      .from('automations')
      .select('id, name, owner_id')
      .in('status', ['Active', 'active']);

    if (error) {
      errors.push(`Failed to get active automations: ${error.message}`);
      return { automationsProcessed, totalAdded, totalRemoved, errors };
    }

    for (const automation of (automations || [])) {
      try {
        const result = await this.refreshAutomationSchedule(automation.id);
        totalAdded += result.added;
        totalRemoved += result.removed;
        automationsProcessed++;

        if (result.errors.length > 0) {
          errors.push(...result.errors.map(e => `[${automation.name}] ${e}`));
        }
      } catch (err) {
        errors.push(`Failed to refresh automation ${automation.name}: ${err.message}`);
      }
    }

    return { automationsProcessed, totalAdded, totalRemoved, errors };
  },


  /**
   * Generate all scheduled emails for an automation when it's activated
   * This schedules ALL qualifying accounts/dates, not just 30 days ahead
   * @param {string} automationId - The automation ID
   * @returns {Promise<{scheduled: number, errors: string[]}>}
   */
  async generateAutomationSchedule(automationId) {
    const errors = [];
    let scheduledCount = 0;

    // Get the automation with its configuration
    const { data: automation, error: autoError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .single();

    if (autoError) throw autoError;
    if (!automation) throw new Error('Automation not found');

    // Parse the workflow to find send_email nodes and their preceding trigger logic
    const nodes = automation.nodes || [];
    const filterConfig = automation.filter_config || { groups: [] };

    // Find the trigger node to get timing settings
    const triggerNode = nodes.find(n => n.type === 'trigger');
    const sendTime = triggerNode?.config?.time || '09:00';
    const timezone = triggerNode?.config?.timezone || 'America/Chicago';

    // Identify date-based trigger rules in the filter config
    const dateTriggerRules = this.extractDateTriggerRules(filterConfig);

    if (dateTriggerRules.length === 0) {
      // No date-based triggers - this automation runs on a recurring schedule
      // for accounts that currently match criteria (not pre-scheduling)
      return { scheduled: 0, errors: ['No date-based trigger rules found - automation uses recurring schedule'] };
    }

    // Get all accounts matching the filter criteria (without date restrictions)
    const baseFilterConfig = this.removeRelativeDateRules(filterConfig);

    // Get matching accounts
    // For system/default automations (no owner_id), we need to get all accounts
    // For user automations, filter by owner
    let matchingAccounts;
    try {
      if (automation.owner_id) {
        matchingAccounts = await massEmailsService.getRecipients([automation.owner_id], baseFilterConfig, { limit: 10000 });
      } else {
        // System automation - get all accounts matching criteria
        // We'll need to query directly since massEmailsService requires ownerIds
        const { data: accounts, error: accountError } = await supabase
          .from('accounts')
          .select('*')
          .or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false')
          .limit(10000);

        if (accountError) throw accountError;
        matchingAccounts = (accounts || []).filter(a => {
          const email = a.person_email || a.email;
          return email && email.includes('@');
        });
      }
    } catch (err) {
      errors.push(`Failed to get matching accounts: ${err.message}`);
      return { scheduled: 0, errors };
    }

    if (!matchingAccounts || matchingAccounts.length === 0) {
      return { scheduled: 0, errors: ['No accounts match the base filter criteria'] };
    }

    // Get all policies for these accounts to determine trigger dates
    const accountIds = matchingAccounts.map(a => a.account_unique_id);
    const { data: policies, error: policyError } = await supabase
      .from('policies')
      .select('account_id, policy_lob, expiration_date, effective_date, policy_status')
      .in('account_id', accountIds)
      .eq('policy_status', 'Active');

    if (policyError) {
      errors.push(`Failed to get policies: ${policyError.message}`);
      return { scheduled: 0, errors };
    }

    // Build a map of account -> trigger dates based on the rules
    const accountTriggerDates = this.calculateTriggerDates(
      matchingAccounts,
      policies || [],
      dateTriggerRules,
      automation
    );

    // Find all send_email nodes and their delays
    const emailSchedule = this.buildEmailSchedule(nodes);

    // Fetch template details for each email step (for admin review: from_email, from_name, subject)
    const templateIds = [...new Set(emailSchedule.map(e => e.templateId))];
    const { data: templates } = await supabase
      .from('email_templates')
      .select('id, from_email, from_name, subject')
      .in('id', templateIds);

    const templateMap = {};
    (templates || []).forEach(t => {
      templateMap[t.id] = t;
    });

    // Check for existing scheduled emails to avoid duplicates
    const { data: existingScheduled } = await supabase
      .from('scheduled_emails')
      .select('account_id, template_id, qualification_value')
      .eq('automation_id', automationId)
      .in('status', ['Pending', 'Processing']);

    const existingKeys = new Set(
      (existingScheduled || []).map(e => `${e.account_id}:${e.template_id}:${e.qualification_value}`)
    );

    // Generate scheduled emails
    const scheduledEmails = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const account of matchingAccounts) {
      const triggerDates = accountTriggerDates[account.account_unique_id] || [];

      for (const triggerDate of triggerDates) {
        // Calculate send dates for each email in the workflow
        for (const emailStep of emailSchedule) {
          // Calculate actual send date based on trigger date and delay
          const sendDate = new Date(triggerDate.date);
          sendDate.setDate(sendDate.getDate() + emailStep.daysOffset);

          // Parse send time
          const [hours, minutes] = sendTime.split(':').map(Number);
          sendDate.setHours(hours, minutes, 0, 0);

          // Skip if send date is in the past
          if (sendDate < today) continue;

          // Create unique key for deduplication
          const qualificationValue = triggerDate.date.toISOString().split('T')[0];
          const uniqueKey = `${account.account_unique_id}:${emailStep.templateId}:${qualificationValue}`;

          // Skip if already scheduled
          if (existingKeys.has(uniqueKey)) continue;

          // Get template details for admin review
          const template = templateMap[emailStep.templateId] || {};

          scheduledEmails.push({
            // Always use owner_id from account (not automation) since some automations are system defaults
            owner_id: account.owner_id,
            automation_id: automationId,
            account_id: account.account_unique_id,
            template_id: emailStep.templateId,
            recipient_email: account.person_email || account.email,
            recipient_name: account.primary_contact_first_name
              ? `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim()
              : account.name,
            scheduled_for: sendDate.toISOString(),
            status: 'Pending',
            qualification_value: qualificationValue,
            trigger_field: triggerDate.field,
            node_id: emailStep.nodeId,
            requires_verification: true, // Flag for 24-hour pre-send check
            // Template details for admin review
            from_email: template.from_email,
            from_name: template.from_name,
            subject: template.subject
          });

          existingKeys.add(uniqueKey);
        }
      }
    }

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < scheduledEmails.length; i += batchSize) {
      const batch = scheduledEmails.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('scheduled_emails')
        .insert(batch);

      if (insertError) {
        errors.push(`Batch insert error: ${insertError.message}`);
      } else {
        scheduledCount += batch.length;
      }
    }

    return { scheduled: scheduledCount, errors };
  },

  /**
   * Extract date-based trigger rules from filter config
   */
  extractDateTriggerRules(filterConfig) {
    const rules = [];
    const groups = filterConfig?.groups || [];

    for (const group of groups) {
      for (const rule of (group.rules || [])) {
        if (['policy_expiration', 'policy_effective', 'account_created'].includes(rule.field)) {
          // Only include relative date rules (in_next_days, in_last_days, etc.)
          if (['in_next_days', 'in_last_days', 'less_than_days_future', 'more_than_days_future'].includes(rule.operator)) {
            rules.push({
              field: rule.field,
              operator: rule.operator,
              value: parseInt(rule.value, 10),
              policyType: group.rules?.find(r => r.field === 'active_policy_type' || r.field === 'policy_type')?.value
            });
          }
        }
      }
    }

    return rules;
  },

  /**
   * Remove relative date rules from filter config
   * (Keep everything else for account matching)
   */
  removeRelativeDateRules(filterConfig) {
    const modifiedConfig = { ...filterConfig };
    modifiedConfig.groups = (filterConfig.groups || []).map(group => ({
      ...group,
      rules: (group.rules || []).filter(rule => {
        if (['policy_expiration', 'policy_effective', 'account_created'].includes(rule.field)) {
          return !['in_next_days', 'in_last_days', 'less_than_days_future', 'more_than_days_future'].includes(rule.operator);
        }
        return true;
      })
    }));
    return modifiedConfig;
  },

  /**
   * Calculate trigger dates for accounts based on date rules
   */
  calculateTriggerDates(accounts, policies, dateTriggerRules, automation) {
    const accountTriggerDates = {};

    // Build policy map
    const policyMap = {};
    for (const policy of policies) {
      if (!policyMap[policy.account_id]) {
        policyMap[policy.account_id] = [];
      }
      policyMap[policy.account_id].push(policy);
    }

    for (const account of accounts) {
      accountTriggerDates[account.account_unique_id] = [];
      const accountPolicies = policyMap[account.account_unique_id] || [];

      for (const rule of dateTriggerRules) {
        if (rule.field === 'policy_expiration' || rule.field === 'policy_effective') {
          const dateField = rule.field === 'policy_expiration' ? 'expiration_date' : 'effective_date';

          for (const policy of accountPolicies) {
            // Check if policy type matches (if specified)
            if (rule.policyType) {
              const policyTypes = rule.policyType.split(',').map(t => t.toLowerCase().trim());
              if (!policyTypes.some(t => policy.policy_lob?.toLowerCase().includes(t))) {
                continue;
              }
            }

            const dateValue = policy[dateField];
            if (dateValue) {
              accountTriggerDates[account.account_unique_id].push({
                field: rule.field,
                date: new Date(dateValue),
                policyLob: policy.policy_lob
              });
            }
          }
        } else if (rule.field === 'account_created') {
          if (account.created_at) {
            accountTriggerDates[account.account_unique_id].push({
              field: rule.field,
              date: new Date(account.created_at)
            });
          }
        }
      }
    }

    return accountTriggerDates;
  },

  /**
   * Build email schedule from workflow nodes
   * Returns array of { nodeId, templateId, daysOffset }
   */
  buildEmailSchedule(nodes) {
    const schedule = [];
    let currentDelay = 0;

    const processNodes = (nodeList) => {
      for (const node of nodeList) {
        if (node.type === 'send_email' && node.config?.template) {
          schedule.push({
            nodeId: node.id,
            templateId: node.config.template,
            daysOffset: currentDelay
          });
        } else if (node.type === 'delay') {
          const duration = node.config?.duration || 0;
          const unit = node.config?.unit || 'days';
          if (unit === 'days') {
            currentDelay += duration;
          } else if (unit === 'weeks') {
            currentDelay += duration * 7;
          } else if (unit === 'hours') {
            currentDelay += duration / 24;
          }
        }

        // Process branches if they exist (for condition nodes)
        if (node.branches) {
          // For simplicity, we only process the "yes" branch for scheduling
          // Real implementation might need to handle both paths
          if (node.branches.yes) {
            processNodes(node.branches.yes);
          }
        }
      }
    };

    // Skip entry_criteria and trigger nodes
    const workflowNodes = nodes.filter(n => n.type !== 'entry_criteria' && n.type !== 'trigger');
    processNodes(workflowNodes);

    return schedule;
  },

  /**
   * Verify if an account still qualifies for a scheduled email
   * Called 24 hours before send time
   * @param {object} scheduledEmail - The scheduled email record
   * @returns {Promise<{qualifies: boolean, reason?: string}>}
   */
  async verifyAccountQualifies(scheduledEmail) {
    const { automation_id, account_id, qualification_value, trigger_field } = scheduledEmail;

    // Get the automation
    const { data: automation, error: autoError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automation_id)
      .single();

    if (autoError || !automation) {
      return { qualifies: false, reason: 'Automation not found or inactive' };
    }

    // Check if automation is still active
    if (automation.status !== 'Active' && automation.status !== 'active') {
      return { qualifies: false, reason: 'Automation is not active' };
    }

    // Get the account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('account_unique_id', account_id)
      .single();

    if (accountError || !account) {
      return { qualifies: false, reason: 'Account not found' };
    }

    // Check if account is opted out
    if (account.person_has_opted_out_of_email) {
      return { qualifies: false, reason: 'Account has opted out of email' };
    }

    // Verify the trigger condition still applies
    if (trigger_field === 'policy_expiration' || trigger_field === 'policy_effective') {
      const dateField = trigger_field === 'policy_expiration' ? 'expiration_date' : 'effective_date';

      const { data: policies } = await supabase
        .from('policies')
        .select('*')
        .eq('account_id', account_id)
        .eq('policy_status', 'Active')
        .eq(dateField, qualification_value);

      if (!policies || policies.length === 0) {
        return { qualifies: false, reason: `Policy with ${trigger_field} = ${qualification_value} no longer exists or is inactive` };
      }
    }

    // Check template-level deduplication (same template sent in last 7 days)
    if (scheduledEmail.template_id) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentSends } = await supabase
        .from('email_logs')
        .select('id')
        .eq('template_id', scheduledEmail.template_id)
        .ilike('to_email', (account.person_email || account.email || '').trim())
        .gte('sent_at', sevenDaysAgo.toISOString())
        .in('status', ['Sent', 'Delivered', 'Opened', 'Clicked'])
        .limit(1);

      if (recentSends && recentSends.length > 0) {
        return { qualifies: false, reason: 'Template already sent to this recipient within 7 days' };
      }
    }

    return { qualifies: true };
  },

  /**
   * Get scheduled emails ready for 24-hour verification
   * @returns {Promise<object[]>}
   */
  async getEmailsForVerification() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'Pending')
      .eq('requires_verification', true)
      .lte('scheduled_for', in24Hours.toISOString())
      .gte('scheduled_for', now.toISOString())
      .order('scheduled_for');

    if (error) throw error;
    return data || [];
  },

  /**
   * Run 24-hour verification on pending emails
   * @returns {Promise<{verified: number, cancelled: number, errors: string[]}>}
   */
  async runVerification() {
    const errors = [];
    let verifiedCount = 0;
    let cancelledCount = 0;

    const emails = await this.getEmailsForVerification();

    for (const email of emails) {
      try {
        const result = await this.verifyAccountQualifies(email);

        if (result.qualifies) {
          // Mark as verified (remove verification requirement)
          await supabase
            .from('scheduled_emails')
            .update({ requires_verification: false })
            .eq('id', email.id);
          verifiedCount++;
        } else {
          // Cancel the email
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'Cancelled',
              error_message: result.reason
            })
            .eq('id', email.id);
          cancelledCount++;
        }
      } catch (err) {
        errors.push(`Error verifying email ${email.id}: ${err.message}`);
      }
    }

    return { verified: verifiedCount, cancelled: cancelledCount, errors };
  },

  /**
   * Clean up scheduled emails when automation is deactivated
   * @param {string} automationId
   * @returns {Promise<{cancelled: number}>}
   */
  async cleanupAutomationSchedule(automationId) {
    const { data, error } = await supabase
      .from('scheduled_emails')
      .update({ status: 'Cancelled', error_message: 'Automation deactivated' })
      .eq('automation_id', automationId)
      .eq('status', 'Pending')
      .select('id');

    if (error) throw error;
    return { cancelled: data?.length || 0 };
  },

  /**
   * Refresh scheduled emails for an automation
   * Adds any new qualifying accounts/dates, removes invalid ones
   * @param {string} automationId
   * @returns {Promise<{added: number, removed: number, errors: string[]}>}
   */
  async refreshAutomationSchedule(automationId) {
    // First, clean up any invalid pending emails
    const errors = [];
    let addedCount = 0;
    let removedCount = 0;

    // Get pending emails for this automation
    const { data: pendingEmails } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('automation_id', automationId)
      .eq('status', 'Pending');

    // Verify each pending email still qualifies
    for (const email of (pendingEmails || [])) {
      try {
        const result = await this.verifyAccountQualifies(email);
        if (!result.qualifies) {
          await supabase
            .from('scheduled_emails')
            .update({ status: 'Cancelled', error_message: result.reason })
            .eq('id', email.id);
          removedCount++;
        }
      } catch (err) {
        errors.push(`Error checking email ${email.id}: ${err.message}`);
      }
    }

    // Re-generate schedule to pick up any new accounts/dates
    const generateResult = await this.generateAutomationSchedule(automationId);
    addedCount = generateResult.scheduled;
    errors.push(...generateResult.errors);

    return { added: addedCount, removed: removedCount, errors };
  },

  /**
   * Handle automation status change
   * @param {string} automationId
   * @param {string} newStatus - 'active', 'paused', 'archived'
   */
  async handleStatusChange(automationId, newStatus) {
    if (newStatus === 'active' || newStatus === 'Active') {
      // Generate schedule when automation is activated
      return this.generateAutomationSchedule(automationId);
    } else {
      // Cancel pending emails when automation is paused/archived
      return this.cleanupAutomationSchedule(automationId);
    }
  },

  /**
   * Handle new account creation - check if it should be added to any active automations
   * @param {string} accountId
   * @param {string} ownerId
   */
  async handleNewAccount(accountId, ownerId) {
    // Get all active automations for this owner
    const { data: automations } = await supabase
      .from('automations')
      .select('*')
      .eq('owner_id', ownerId)
      .in('status', ['Active', 'active']);

    if (!automations || automations.length === 0) return { scheduled: 0 };

    let totalScheduled = 0;

    for (const automation of automations) {
      // Check if this account matches the filter criteria
      const filterConfig = automation.filter_config;
      if (!filterConfig) continue;

      // Get the account
      const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('account_unique_id', accountId)
        .single();

      if (!account) continue;

      // Check if account matches (simplified - would need full filter evaluation)
      const recipients = await massEmailsService.getRecipients([ownerId], filterConfig, { limit: 1 });
      const accountMatches = recipients.some(r => r.account_unique_id === accountId);

      if (accountMatches) {
        // Re-run schedule generation - it will only add new emails due to deduplication
        const result = await this.generateAutomationSchedule(automation.id);
        totalScheduled += result.scheduled;
      }
    }

    return { scheduled: totalScheduled };
  },

  /**
   * Handle policy change - update schedules for affected automations
   * @param {string} accountId
   * @param {string} policyId
   */
  async handlePolicyChange(accountId, policyId) {
    // Get the account's owner
    const { data: account } = await supabase
      .from('accounts')
      .select('owner_id')
      .eq('account_unique_id', accountId)
      .single();

    if (!account) return { updated: 0 };

    // Get active automations that use policy-based triggers
    const { data: automations } = await supabase
      .from('automations')
      .select('*')
      .eq('owner_id', account.owner_id)
      .in('status', ['Active', 'active']);

    if (!automations) return { updated: 0 };

    let updatedCount = 0;

    for (const automation of automations) {
      const dateTriggerRules = this.extractDateTriggerRules(automation.filter_config);
      const hasPolicyTrigger = dateTriggerRules.some(r =>
        r.field === 'policy_expiration' || r.field === 'policy_effective'
      );

      if (hasPolicyTrigger) {
        await this.refreshAutomationSchedule(automation.id);
        updatedCount++;
      }
    }

    return { updated: updatedCount };
  }
};

export default automationSchedulerService;
