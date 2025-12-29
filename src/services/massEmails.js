// src/services/massEmails.js
import { supabase } from '../lib/supabase';

// Haversine formula to calculate distance between two points in miles
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Simple geocoding cache to avoid repeated lookups
const geocodeCache = {};

// Geocode a zip code or city using Nominatim
const geocodeLocation = async (location) => {
  if (geocodeCache[location]) {
    return geocodeCache[location];
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&q=${encodeURIComponent(location)}&limit=1`
    );
    const data = await response.json();
    if (data && data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[location] = result;
      return result;
    }
  } catch (err) {
    console.error('Geocoding error:', err);
  }
  return null;
};

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
   * Get recipients based on filter config with dynamic rules
   */
  async getRecipients(ownerId, filterConfig, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const {
      rules = [],
      notOptedOut = true,
      search = ''
    } = filterConfig || {};

    // Parse rules to extract account-level and policy-level filters
    const accountStatusRules = rules.filter(r => r.field === 'account_status' && r.value);
    const policyTypeRules = rules.filter(r => r.field === 'policy_type' && r.value);
    const policyCountRules = rules.filter(r => r.field === 'policy_count' && r.value);
    const policyExpirationRules = rules.filter(r => r.field === 'policy_expiration' && r.value);
    const locationRules = rules.filter(r => r.field === 'location' && r.value);
    const stateRules = rules.filter(r => r.field === 'state' && r.value);
    const cityRules = rules.filter(r => r.field === 'city' && r.value);

    // Get accounts first - include location fields for filtering
    let query = supabase
      .from('accounts')
      .select('account_unique_id, name, person_email, email, account_status, primary_contact_first_name, primary_contact_last_name, person_has_opted_out_of_email, billing_city, billing_state, billing_postal_code, billing_street')
      .eq('owner_id', ownerId);

    // Apply account status filters at query level
    if (accountStatusRules.length > 0) {
      const statusRule = accountStatusRules[0]; // Use first rule
      if (statusRule.operator === 'is') {
        query = query.eq('account_status', statusRule.value);
      } else if (statusRule.operator === 'is_not') {
        query = query.neq('account_status', statusRule.value);
      } else if (statusRule.operator === 'is_any') {
        const values = statusRule.value.split(',').filter(v => v);
        if (values.length > 0) {
          query = query.in('account_status', values);
        }
      }
    }

    // Not opted out
    if (notOptedOut) {
      query = query.or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false');
    }

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.order('name').range(offset, offset + limit - 1);

    const { data: accounts, error } = await query;
    if (error) throw error;

    // Filter to only include accounts with valid emails
    let recipients = accounts.filter(account => {
      const email = account.person_email || account.email;
      return email && email.includes('@');
    });

    // Check if we need policy filtering
    const needsPolicyFilter = policyTypeRules.length > 0 || policyCountRules.length > 0 || policyExpirationRules.length > 0;

    if (needsPolicyFilter && recipients.length > 0) {
      const accountIds = recipients.map(a => a.account_unique_id);

      // Fetch policies for these accounts
      const { data: policies, error: policyError } = await supabase
        .from('policies')
        .select('account_id, policy_lob, expiration_date, policy_status')
        .in('account_id', accountIds);

      if (policyError) throw policyError;

      // Group policies by account
      const policyMap = {};
      policies.forEach(p => {
        if (!policyMap[p.account_id]) {
          policyMap[p.account_id] = [];
        }
        policyMap[p.account_id].push(p);
      });

      // Apply policy filters
      recipients = recipients.filter(account => {
        const accountPolicies = policyMap[account.account_unique_id] || [];

        // Policy count rules
        for (const rule of policyCountRules) {
          const count = accountPolicies.length;
          const targetCount = parseInt(rule.value, 10);
          if (rule.operator === 'equals' && count !== targetCount) return false;
          if (rule.operator === 'greater_than' && count <= targetCount) return false;
          if (rule.operator === 'less_than' && count >= targetCount) return false;
          if (rule.operator === 'at_least' && count < targetCount) return false;
        }

        // Policy type rules
        for (const rule of policyTypeRules) {
          const values = rule.operator === 'is_any' ? rule.value.split(',') : [rule.value];
          const hasMatch = accountPolicies.some(p =>
            values.some(v => p.policy_lob?.toLowerCase().includes(v.toLowerCase()))
          );

          if (rule.operator === 'is' && !hasMatch) return false;
          if (rule.operator === 'is_any' && !hasMatch) return false;
          if (rule.operator === 'is_not' && hasMatch) return false;
        }

        // Policy expiration rules
        const today = new Date().toISOString().split('T')[0];
        for (const rule of policyExpirationRules) {
          if (rule.operator === 'in_next_days') {
            const days = parseInt(rule.value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];

            const hasExpiring = accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= today && p.expiration_date <= futureDateStr
            );
            if (!hasExpiring) return false;
          } else if (rule.operator === 'before') {
            const hasMatch = accountPolicies.some(p =>
              p.expiration_date && p.expiration_date < rule.value
            );
            if (!hasMatch) return false;
          } else if (rule.operator === 'after') {
            const hasMatch = accountPolicies.some(p =>
              p.expiration_date && p.expiration_date > rule.value
            );
            if (!hasMatch) return false;
          } else if (rule.operator === 'between') {
            const hasMatch = accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= rule.value && p.expiration_date <= (rule.value2 || rule.value)
            );
            if (!hasMatch) return false;
          }
        }

        return true;
      });
    }

    // Apply state filter
    if (stateRules.length > 0 && recipients.length > 0) {
      recipients = recipients.filter(account => {
        for (const rule of stateRules) {
          const accountState = (account.billing_state || '').toUpperCase();
          if (rule.operator === 'is') {
            if (accountState !== rule.value.toUpperCase()) return false;
          } else if (rule.operator === 'is_not') {
            if (accountState === rule.value.toUpperCase()) return false;
          } else if (rule.operator === 'is_any') {
            const values = rule.value.split(',').map(v => v.toUpperCase());
            if (!values.includes(accountState)) return false;
          }
        }
        return true;
      });
    }

    // Apply city filter
    if (cityRules.length > 0 && recipients.length > 0) {
      recipients = recipients.filter(account => {
        for (const rule of cityRules) {
          const accountCity = (account.billing_city || '').toLowerCase();
          const ruleValue = (rule.value || '').toLowerCase();
          if (rule.operator === 'contains') {
            if (!accountCity.includes(ruleValue)) return false;
          } else if (rule.operator === 'equals') {
            if (accountCity !== ruleValue) return false;
          } else if (rule.operator === 'starts_with') {
            if (!accountCity.startsWith(ruleValue)) return false;
          }
        }
        return true;
      });
    }

    // Apply location/radius filter
    if (locationRules.length > 0 && recipients.length > 0) {
      for (const rule of locationRules) {
        const [centerLat, centerLng] = rule.value.split(',').map(parseFloat);
        const radiusMiles = parseInt(rule.radius || '25', 10);

        // Geocode each account's address and filter by distance
        const geocodedRecipients = await Promise.all(
          recipients.map(async (account) => {
            // Build address string for geocoding
            const addressParts = [
              account.billing_postal_code,
              account.billing_city,
              account.billing_state
            ].filter(Boolean);

            if (addressParts.length === 0) {
              return { account, inRadius: false };
            }

            const addressStr = addressParts.join(', ');
            const coords = await geocodeLocation(addressStr);

            if (!coords) {
              return { account, inRadius: false };
            }

            const distance = calculateDistance(centerLat, centerLng, coords.lat, coords.lng);
            return { account, inRadius: distance <= radiusMiles };
          })
        );

        recipients = geocodedRecipients
          .filter(r => r.inRadius)
          .map(r => r.account);
      }
    }

    return recipients;
  },

  /**
   * Count recipients based on filter config with dynamic rules
   */
  async countRecipients(ownerId, filterConfig) {
    const {
      rules = [],
      notOptedOut = true,
      search = ''
    } = filterConfig || {};

    // Check if we need client-side filtering (policy or location filters)
    const policyTypeRules = rules.filter(r => r.field === 'policy_type' && r.value);
    const policyCountRules = rules.filter(r => r.field === 'policy_count' && r.value);
    const policyExpirationRules = rules.filter(r => r.field === 'policy_expiration' && r.value);
    const locationRules = rules.filter(r => r.field === 'location' && r.value);
    const cityRules = rules.filter(r => r.field === 'city' && r.value);

    const needsClientSideFilter = policyTypeRules.length > 0 || policyCountRules.length > 0 ||
      policyExpirationRules.length > 0 || locationRules.length > 0 || cityRules.length > 0;

    // If we need client-side filtering, fetch and filter
    if (needsClientSideFilter) {
      const recipients = await this.getRecipients(ownerId, filterConfig, { limit: 10000 });
      return recipients.length;
    }

    // Otherwise, use a count query for efficiency
    let query = supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    // Apply account status filters
    const accountStatusRules = rules.filter(r => r.field === 'account_status' && r.value);
    if (accountStatusRules.length > 0) {
      const statusRule = accountStatusRules[0];
      if (statusRule.operator === 'is') {
        query = query.eq('account_status', statusRule.value);
      } else if (statusRule.operator === 'is_not') {
        query = query.neq('account_status', statusRule.value);
      } else if (statusRule.operator === 'is_any') {
        const values = statusRule.value.split(',').filter(v => v);
        if (values.length > 0) {
          query = query.in('account_status', values);
        }
      }
    }

    // Apply state filters at query level
    const stateRules = rules.filter(r => r.field === 'state' && r.value);
    if (stateRules.length > 0) {
      const stateRule = stateRules[0];
      if (stateRule.operator === 'is') {
        query = query.ilike('billing_state', stateRule.value);
      } else if (stateRule.operator === 'is_not') {
        query = query.not('billing_state', 'ilike', stateRule.value);
      } else if (stateRule.operator === 'is_any') {
        const values = stateRule.value.split(',').filter(v => v);
        if (values.length > 0) {
          query = query.in('billing_state', values);
        }
      }
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

    // Get recipients (fetch more for actual sending)
    const recipients = await this.getRecipients(ownerId, batch.filter_config, { limit: 10000 });
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
