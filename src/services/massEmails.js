// src/services/massEmails.js
import { supabase } from '../lib/supabase';

export const massEmailsService = {
  /**
   * Get all mass email batches for a user
   */
  async getAll(ownerId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('mass_email_batches')
      .select(`
        *,
        template:email_templates(id, name, subject)
      `)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get a single mass email batch by ID
   */
  async getById(ownerId, batchId) {
    const { data, error } = await supabase
      .from('mass_email_batches')
      .select(`
        *,
        template:email_templates(*)
      `)
      .eq('owner_id', ownerId)
      .eq('id', batchId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create a new mass email batch (draft)
   */
  async create(ownerId, batch) {
    const { data, error } = await supabase
      .from('mass_email_batches')
      .insert({
        owner_id: ownerId,
        status: 'Draft',
        ...batch
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update a mass email batch
   */
  async update(ownerId, batchId, updates) {
    const { data, error } = await supabase
      .from('mass_email_batches')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('id', batchId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a mass email batch (only drafts)
   */
  async delete(ownerId, batchId) {
    const { error } = await supabase
      .from('mass_email_batches')
      .delete()
      .eq('owner_id', ownerId)
      .eq('id', batchId)
      .eq('status', 'Draft'); // Safety: only delete drafts

    if (error) throw error;
    return true;
  },

  /**
   * Get recipients based on filter config
   */
  async getRecipients(ownerId, filterConfig, options = {}) {
    const { limit = 100, offset = 0, countOnly = false } = options;
    const { statuses = [], hasEmail = true, notOptedOut = true, search = '' } = filterConfig || {};

    // Build the query
    let query = supabase
      .from('accounts')
      .select(countOnly ? '*' : 'account_unique_id, name, person_email, email, account_status, primary_contact_first_name, primary_contact_last_name, person_has_opted_out_of_email',
        countOnly ? { count: 'exact', head: true } : undefined)
      .eq('owner_id', ownerId);

    // Filter by statuses
    if (statuses.length > 0) {
      query = query.in('account_status', statuses);
    }

    // Must have email
    if (hasEmail) {
      query = query.or('person_email.neq.,email.neq.');
    }

    // Not opted out
    if (notOptedOut) {
      query = query.or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false');
    }

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (countOnly) {
      const { count, error } = await query;
      if (error) throw error;
      return { count };
    }

    // Apply pagination for data query
    query = query.order('name').range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    // Filter to only include accounts with valid emails
    const recipients = data.filter(account => {
      const email = account.person_email || account.email;
      return email && email.includes('@');
    });

    return recipients;
  },

  /**
   * Count recipients based on filter config
   */
  async countRecipients(ownerId, filterConfig) {
    const { statuses = [], hasEmail = true, notOptedOut = true, search = '' } = filterConfig || {};

    let query = supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    // Filter by statuses
    if (statuses.length > 0) {
      query = query.in('account_status', statuses);
    }

    // Not opted out
    if (notOptedOut) {
      query = query.or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false');
    }

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { count, error } = await query;
    if (error) throw error;

    return count || 0;
  },

  /**
   * Schedule a mass email batch for sending
   * Creates scheduled_emails entries for each recipient
   */
  async scheduleBatch(ownerId, batchId, scheduledFor = null) {
    // Get the batch
    const batch = await this.getById(ownerId, batchId);
    if (!batch) throw new Error('Batch not found');
    if (batch.status !== 'Draft') throw new Error('Can only schedule draft batches');

    // Get recipients
    const recipients = await this.getRecipients(ownerId, batch.filter_config);
    if (recipients.length === 0) throw new Error('No recipients match the filter');

    const sendTime = scheduledFor || new Date().toISOString();

    // Create scheduled emails for each recipient
    const scheduledEmails = recipients.map(recipient => ({
      owner_id: ownerId,
      account_id: recipient.account_unique_id,
      template_id: batch.template_id,
      recipient_email: recipient.person_email || recipient.email,
      recipient_name: recipient.primary_contact_first_name
        ? `${recipient.primary_contact_first_name} ${recipient.primary_contact_last_name || ''}`.trim()
        : recipient.name,
      subject: batch.subject,
      scheduled_for: sendTime,
      status: 'Pending',
      batch_id: batchId
    }));

    // Insert in batches of 100
    const batchSize = 100;
    let totalCreated = 0;

    for (let i = 0; i < scheduledEmails.length; i += batchSize) {
      const chunk = scheduledEmails.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('scheduled_emails')
        .insert(chunk)
        .select();

      if (error) throw error;
      totalCreated += data.length;
    }

    // Update batch status
    await this.update(ownerId, batchId, {
      status: scheduledFor ? 'Scheduled' : 'Sending',
      total_recipients: recipients.length,
      scheduled_for: sendTime,
      started_at: scheduledFor ? null : new Date().toISOString()
    });

    return {
      scheduled: totalCreated,
      total: recipients.length,
      scheduledFor: sendTime
    };
  },

  /**
   * Cancel a scheduled batch
   */
  async cancelBatch(ownerId, batchId) {
    // Update batch status
    await this.update(ownerId, batchId, {
      status: 'Cancelled'
    });

    // Cancel all pending scheduled emails for this batch
    const { error } = await supabase
      .from('scheduled_emails')
      .update({ status: 'Cancelled' })
      .eq('owner_id', ownerId)
      .eq('batch_id', batchId)
      .eq('status', 'Pending');

    if (error) throw error;

    return true;
  },

  /**
   * Get batch stats
   */
  async getBatchStats(ownerId, batchId) {
    const { data, error } = await supabase
      .from('scheduled_emails')
      .select('status')
      .eq('owner_id', ownerId)
      .eq('batch_id', batchId);

    if (error) throw error;

    const stats = {
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      total: data.length
    };

    data.forEach(e => {
      const status = e.status.toLowerCase();
      if (stats[status] !== undefined) {
        stats[status]++;
      }
    });

    return stats;
  },

  /**
   * Get all batches with stats summary
   */
  async getAllWithStats(ownerId, options = {}) {
    const batches = await this.getAll(ownerId, options);

    // Get stats for non-draft batches
    const batchesWithStats = await Promise.all(
      batches.map(async (batch) => {
        if (batch.status === 'Draft') {
          return { ...batch, stats: null };
        }
        const stats = await this.getBatchStats(ownerId, batch.id);
        return { ...batch, stats };
      })
    );

    return batchesWithStats;
  }
};

export default massEmailsService;
