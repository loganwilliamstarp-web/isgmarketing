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

// Fetch with timeout helper
const fetchWithTimeout = async (url, options, timeout = 5000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

// Google Maps API key
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Geocode using Google Maps Geocoding API
const geocodeLocation = async (location) => {
  if (geocodeCache[location]) {
    return geocodeCache[location];
  }

  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('Google Maps API key not configured');
    geocodeCache[location] = null;
    return null;
  }

  try {
    const query = encodeURIComponent(location);
    const response = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_API_KEY}`,
      {},
      5000
    );

    if (response.ok) {
      const data = await response.json();
      if (data.status === 'OK' && data.results?.length > 0) {
        const { lat, lng } = data.results[0].geometry.location;
        const result = { lat, lng };
        geocodeCache[location] = result;
        return result;
      }
    }
  } catch (err) {
    console.warn('Geocoding failed for:', location, err.message);
  }

  // Cache null result to avoid repeated failed lookups
  geocodeCache[location] = null;
  return null;
};

// Batch geocode with rate limiting - processes in parallel batches for speed
const batchGeocode = async (locations, maxConcurrent = 10) => {
  const results = {};
  const uniqueLocations = [...new Set(locations.filter(Boolean))];

  // First, get all cached results immediately
  const uncachedLocations = [];
  for (const location of uniqueLocations) {
    if (geocodeCache[location]) {
      results[location] = geocodeCache[location];
    } else {
      uncachedLocations.push(location);
    }
  }

  // If all results are cached, return immediately
  if (uncachedLocations.length === 0) {
    return results;
  }

  // Process uncached locations in parallel batches
  for (let i = 0; i < uncachedLocations.length; i += maxConcurrent) {
    const batch = uncachedLocations.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(location => geocodeLocation(location))
    );

    batch.forEach((location, idx) => {
      if (batchResults[idx]) {
        results[location] = batchResults[idx];
      }
    });
  }

  return results;
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
   * Supports both legacy format (rules array) and new format (groups array with OR logic)
   * @param {string|string[]} ownerId - Single owner ID or array of owner IDs
   */
  async getRecipients(ownerId, filterConfig, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const {
      rules = [],
      groups = [],
      notOptedOut = true,
      search = ''
    } = filterConfig || {};

    // Convert to groups format for consistent processing
    // If groups exist, use them; otherwise convert legacy rules to single group
    let filterGroups = groups.length > 0 ? groups : (rules.length > 0 ? [{ rules }] : []);

    // Support multiple owner IDs
    const ownerIds = Array.isArray(ownerId) ? ownerId : [ownerId];

    // Get all accounts first (we'll filter client-side for group OR logic)
    let query = supabase
      .from('accounts')
      .select('account_unique_id, name, person_email, email, account_status, primary_contact_first_name, primary_contact_last_name, person_has_opted_out_of_email, billing_city, billing_state, billing_postal_code, billing_street, created_at')
      .in('owner_id', ownerIds);

    // Not opted out (applies globally)
    if (notOptedOut) {
      query = query.or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false');
    }

    // Search filter (applies globally)
    if (search) {
      query = query.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // For groups, we need to fetch more accounts to filter client-side
    // Apply pagination only if no groups (simple case)
    if (filterGroups.length === 0) {
      query = query.order('name').range(offset, offset + limit - 1);
    } else {
      // Fetch more for group filtering, then paginate at the end
      query = query.order('name').limit(10000);
    }

    const { data: accounts, error } = await query;
    if (error) throw error;

    // Filter to only include accounts with valid emails
    let allAccounts = accounts.filter(account => {
      const email = account.person_email || account.email;
      return email && email.includes('@');
    });

    // If no filter groups, return all accounts
    if (filterGroups.length === 0) {
      return allAccounts;
    }

    // Check if we need policy data for any group
    const needsPolicyFilter = filterGroups.some(group => {
      const groupRules = group.rules || [];
      return groupRules.some(r =>
        ['policy_type', 'active_policy_type', 'policy_status', 'policy_count', 'policy_expiration', 'policy_effective'].includes(r.field) && r.value
      );
    });

    // Fetch policies once if needed
    let policyMap = {};
    if (needsPolicyFilter && allAccounts.length > 0) {
      const accountIds = allAccounts.map(a => a.account_unique_id);
      const { data: policies, error: policyError } = await supabase
        .from('policies')
        .select('account_id, policy_lob, expiration_date, effective_date, policy_status')
        .in('account_id', accountIds);

      if (policyError) throw policyError;

      policies.forEach(p => {
        if (!policyMap[p.account_id]) {
          policyMap[p.account_id] = [];
        }
        policyMap[p.account_id].push(p);
      });
    }

    // Always fetch last email sent dates for display and filtering
    let lastEmailMap = {};
    if (allAccounts.length > 0) {
      const accountIds = allAccounts.map(a => a.account_unique_id);
      // Get the most recent email sent to each account
      const { data: emailLogs, error: emailError } = await supabase
        .from('email_logs')
        .select('account_id, sent_at')
        .in('account_id', accountIds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false });

      if (emailError) throw emailError;

      // Build map of account_id -> most recent sent_at
      emailLogs?.forEach(log => {
        if (!lastEmailMap[log.account_id] && log.sent_at) {
          lastEmailMap[log.account_id] = log.sent_at;
        }
      });
    }

    // Check if we need location geocoding for any group
    const needsLocationFilter = filterGroups.some(group => {
      const groupRules = group.rules || [];
      return groupRules.some(r => r.field === 'location' && r.value);
    });

    // Pre-geocode all locations if needed
    let geocodeResults = {};
    if (needsLocationFilter && allAccounts.length > 0) {
      const locationMap = {};
      allAccounts.forEach(account => {
        const zip = (account.billing_postal_code || '').trim();
        const city = (account.billing_city || '').trim();
        const state = (account.billing_state || '').trim();
        let locationKey = '';
        if (zip && state) {
          locationKey = `${zip}, ${state}, USA`;
        } else if (city && state) {
          locationKey = `${city}, ${state}, USA`;
        } else if (zip) {
          locationKey = `${zip}, USA`;
        }
        if (locationKey) {
          locationMap[account.account_unique_id] = locationKey;
        }
      });
      const uniqueLocations = [...new Set(Object.values(locationMap))];
      geocodeResults = await batchGeocode(uniqueLocations);
      // Attach location keys to accounts for later use
      allAccounts.forEach(account => {
        account._locationKey = locationMap[account.account_unique_id];
      });
    }

    // Helper function to check if an account matches a single rule
    const matchesRule = (account, rule, accountPolicies) => {
      const { field, operator, value, value2, radius } = rule;
      if (!field || !operator) return true; // Incomplete rules are ignored

      // Handle empty checks that don't need a value
      const needsValue = !['is_empty', 'is_not_empty'].includes(operator);
      if (needsValue && !value) return true;

      switch (field) {
        case 'account_status': {
          const status = (account.account_status || '').toLowerCase();
          if (operator === 'is') return status === value.toLowerCase();
          if (operator === 'is_not') return status !== value.toLowerCase();
          if (operator === 'is_any') {
            const values = value.split(',').map(v => v.toLowerCase());
            return values.includes(status);
          }
          if (operator === 'is_not_any') {
            const values = value.split(',').map(v => v.toLowerCase());
            return !values.includes(status);
          }
          return true;
        }

        case 'policy_type': {
          const values = ['is_any', 'is_not_any'].includes(operator) ? value.split(',') : [value];
          const hasMatch = accountPolicies.some(p =>
            values.some(v => p.policy_lob?.toLowerCase().includes(v.toLowerCase()))
          );
          if (operator === 'is') return hasMatch;
          if (operator === 'is_any') return hasMatch;
          if (operator === 'is_not') return !hasMatch;
          if (operator === 'is_not_any') return !hasMatch;
          return true;
        }

        case 'active_policy_type': {
          const values = ['is_any', 'is_not_any'].includes(operator) ? value.split(',') : [value];
          // Only match policies with status exactly "Active" (not "Pending Active" or similar)
          const activePolicies = accountPolicies.filter(p => {
            const status = p.policy_status?.toLowerCase().trim();
            return status === 'active';
          });
          const hasMatch = activePolicies.some(p =>
            values.some(v => p.policy_lob?.toLowerCase().includes(v.toLowerCase()))
          );
          if (operator === 'is') return hasMatch;
          if (operator === 'is_any') return hasMatch;
          if (operator === 'is_not') return !hasMatch;
          if (operator === 'is_not_any') return !hasMatch;
          return true;
        }

        case 'policy_status': {
          const values = ['is_any', 'is_not_any'].includes(operator) ? value.split(',') : [value];
          const hasMatch = accountPolicies.some(p =>
            values.some(v => p.policy_status?.toLowerCase() === v.toLowerCase())
          );
          if (operator === 'is') return hasMatch;
          if (operator === 'is_any') return hasMatch;
          if (operator === 'is_not') return !hasMatch;
          if (operator === 'is_not_any') return !hasMatch;
          return true;
        }

        case 'policy_count': {
          const count = accountPolicies.length;
          const targetCount = parseInt(value, 10);
          const targetCount2 = value2 ? parseInt(value2, 10) : targetCount;
          if (operator === 'equals') return count === targetCount;
          if (operator === 'greater_than') return count > targetCount;
          if (operator === 'less_than') return count < targetCount;
          if (operator === 'at_least') return count >= targetCount;
          if (operator === 'at_most') return count <= targetCount;
          if (operator === 'between') return count >= targetCount && count <= targetCount2;
          return true;
        }

        case 'policy_expiration': {
          const today = new Date().toISOString().split('T')[0];
          if (operator === 'in_next_days') {
            const days = parseInt(value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= today && p.expiration_date <= futureDateStr
            );
          }
          if (operator === 'in_last_days') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= pastDateStr && p.expiration_date <= today
            );
          }
          if (operator === 'more_than_days_future') {
            const days = parseInt(value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date > futureDateStr
            );
          }
          if (operator === 'less_than_days_future') {
            const days = parseInt(value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= today && p.expiration_date < futureDateStr
            );
          }
          if (operator === 'more_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date < pastDateStr
            );
          }
          if (operator === 'less_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= pastDateStr && p.expiration_date <= today
            );
          }
          if (operator === 'before') {
            return accountPolicies.some(p => p.expiration_date && p.expiration_date < value);
          }
          if (operator === 'after') {
            return accountPolicies.some(p => p.expiration_date && p.expiration_date > value);
          }
          if (operator === 'between') {
            return accountPolicies.some(p =>
              p.expiration_date && p.expiration_date >= value && p.expiration_date <= (value2 || value)
            );
          }
          return true;
        }

        case 'policy_effective': {
          const today = new Date().toISOString().split('T')[0];
          if (operator === 'in_next_days') {
            const days = parseInt(value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date >= today && p.effective_date <= futureDateStr
            );
          }
          if (operator === 'in_last_days') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date >= pastDateStr && p.effective_date <= today
            );
          }
          if (operator === 'more_than_days_future') {
            const days = parseInt(value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date > futureDateStr
            );
          }
          if (operator === 'less_than_days_future') {
            const days = parseInt(value, 10);
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + days);
            const futureDateStr = futureDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date >= today && p.effective_date < futureDateStr
            );
          }
          if (operator === 'more_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date < pastDateStr
            );
          }
          if (operator === 'less_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date >= pastDateStr && p.effective_date <= today
            );
          }
          if (operator === 'before') {
            return accountPolicies.some(p => p.effective_date && p.effective_date < value);
          }
          if (operator === 'after') {
            return accountPolicies.some(p => p.effective_date && p.effective_date > value);
          }
          if (operator === 'between') {
            return accountPolicies.some(p =>
              p.effective_date && p.effective_date >= value && p.effective_date <= (value2 || value)
            );
          }
          return true;
        }

        case 'state': {
          const accountState = (account.billing_state || '').toUpperCase();
          if (operator === 'is') return accountState === value.toUpperCase();
          if (operator === 'is_not') return accountState !== value.toUpperCase();
          if (operator === 'is_any') {
            const values = value.split(',').map(v => v.toUpperCase());
            return values.includes(accountState);
          }
          if (operator === 'is_not_any') {
            const values = value.split(',').map(v => v.toUpperCase());
            return !values.includes(accountState);
          }
          return true;
        }

        case 'city': {
          const accountCity = (account.billing_city || '').toLowerCase();
          const ruleValue = (value || '').toLowerCase();
          if (operator === 'contains') return accountCity.includes(ruleValue);
          if (operator === 'not_contains') return !accountCity.includes(ruleValue);
          if (operator === 'equals') return accountCity === ruleValue;
          if (operator === 'not_equals') return accountCity !== ruleValue;
          if (operator === 'starts_with') return accountCity.startsWith(ruleValue);
          if (operator === 'ends_with') return accountCity.endsWith(ruleValue);
          if (operator === 'is_empty') return accountCity.trim() === '';
          if (operator === 'is_not_empty') return accountCity.trim() !== '';
          return true;
        }

        case 'zip_code': {
          const accountZip = (account.billing_postal_code || '').toLowerCase().trim();
          const ruleValue = (value || '').toLowerCase().trim();
          if (operator === 'contains') return accountZip.includes(ruleValue);
          if (operator === 'not_contains') return !accountZip.includes(ruleValue);
          if (operator === 'equals') return accountZip === ruleValue;
          if (operator === 'not_equals') return accountZip !== ruleValue;
          if (operator === 'starts_with') return accountZip.startsWith(ruleValue);
          if (operator === 'ends_with') return accountZip.endsWith(ruleValue);
          if (operator === 'is_empty') return accountZip === '';
          if (operator === 'is_not_empty') return accountZip !== '';
          return true;
        }

        case 'email_domain': {
          const email = (account.person_email || account.email || '').toLowerCase();
          const domain = email.includes('@') ? email.split('@')[1] : '';
          const ruleValue = (value || '').toLowerCase().trim();
          if (operator === 'contains') return domain.includes(ruleValue);
          if (operator === 'not_contains') return !domain.includes(ruleValue);
          if (operator === 'equals') return domain === ruleValue;
          if (operator === 'not_equals') return domain !== ruleValue;
          if (operator === 'starts_with') return domain.startsWith(ruleValue);
          if (operator === 'ends_with') return domain.endsWith(ruleValue);
          if (operator === 'is_empty') return domain === '';
          if (operator === 'is_not_empty') return domain !== '';
          return true;
        }

        case 'location': {
          if (operator !== 'within_radius' || !value) return true;
          const [centerLat, centerLng] = value.split(',').map(parseFloat);
          const radiusMiles = parseInt(radius || '25', 10);
          const locationKey = account._locationKey;
          if (!locationKey) return false;
          const coords = geocodeResults[locationKey];
          if (!coords) return false;
          const distance = calculateDistance(centerLat, centerLng, coords.lat, coords.lng);
          return distance <= radiusMiles;
        }

        case 'last_email_sent': {
          const lastEmailDate = lastEmailMap[account.account_unique_id];
          const today = new Date().toISOString().split('T')[0];

          // If no email sent, treat as very old for "before" and "in_last_days" checks
          if (!lastEmailDate) {
            if (operator === 'before') return true; // Never emailed = older than any date
            if (operator === 'in_last_days') return false; // Never emailed in last X days
            if (operator === 'less_than_days_ago') return false; // Never emailed
            if (operator === 'more_than_days_ago') return true; // Never emailed = very long ago
            if (operator === 'in_next_days') return false; // Makes no sense for past dates
            if (operator === 'more_than_days_future') return false;
            if (operator === 'less_than_days_future') return false;
            if (operator === 'after') return false; // Never emailed
            if (operator === 'between') return false;
            return true;
          }

          const emailDateStr = lastEmailDate.split('T')[0];

          if (operator === 'in_last_days') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return emailDateStr >= pastDateStr && emailDateStr <= today;
          }
          if (operator === 'more_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return emailDateStr < pastDateStr;
          }
          if (operator === 'less_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return emailDateStr >= pastDateStr && emailDateStr <= today;
          }
          if (operator === 'before') {
            return emailDateStr < value;
          }
          if (operator === 'after') {
            return emailDateStr > value;
          }
          if (operator === 'between') {
            return emailDateStr >= value && emailDateStr <= (value2 || value);
          }
          return true;
        }

        case 'account_created': {
          const createdAt = account.created_at;
          if (!createdAt) return false;

          const createdDateStr = createdAt.split('T')[0];
          const today = new Date().toISOString().split('T')[0];

          if (operator === 'in_next_days' || operator === 'more_than_days_future' || operator === 'less_than_days_future') {
            // For account created, future date operators don't make sense - treat as no match
            return false;
          }
          if (operator === 'in_last_days') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return createdDateStr >= pastDateStr && createdDateStr <= today;
          }
          if (operator === 'more_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return createdDateStr < pastDateStr;
          }
          if (operator === 'less_than_days_ago') {
            const days = parseInt(value, 10);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            const pastDateStr = pastDate.toISOString().split('T')[0];
            return createdDateStr >= pastDateStr && createdDateStr <= today;
          }
          if (operator === 'before') {
            return createdDateStr < value;
          }
          if (operator === 'after') {
            return createdDateStr > value;
          }
          if (operator === 'between') {
            return createdDateStr >= value && createdDateStr <= (value2 || value);
          }
          return true;
        }

        default:
          return true;
      }
    };

    // Helper function to check if an account matches all rules in a group (AND logic)
    const matchesGroup = (account, group) => {
      const groupRules = group.rules || [];
      if (groupRules.length === 0) return true;

      const accountPolicies = policyMap[account.account_unique_id] || [];

      // All rules must match (AND logic)
      return groupRules.every(rule => matchesRule(account, rule, accountPolicies));
    };

    // Apply filter groups with OR logic between groups
    // Track which groups each account matches
    const matchingAccountIds = new Set();
    const matchingAccounts = [];

    for (const account of allAccounts) {
      // Find all matching group indices
      const matchedGroupIndices = [];
      filterGroups.forEach((group, idx) => {
        if (matchesGroup(account, group)) {
          matchedGroupIndices.push(idx);
        }
      });

      if (matchedGroupIndices.length > 0 && !matchingAccountIds.has(account.account_unique_id)) {
        matchingAccountIds.add(account.account_unique_id);
        matchingAccounts.push({
          ...account,
          _matchedGroups: matchedGroupIndices,
          _lastEmailSent: lastEmailMap[account.account_unique_id] || null
        });
      }
    }

    // Apply pagination
    const paginatedResults = matchingAccounts.slice(offset, offset + limit);

    return paginatedResults;
  },

  /**
   * Get recipient count and location breakdown in a single call
   * This avoids duplicate geocoding when both are needed
   * @param {string|string[]} ownerId - Single owner ID or array of owner IDs
   */
  async getRecipientStats(ownerId, filterConfig) {
    const {
      rules = [],
      groups = [],
      notOptedOut = true,
      search = ''
    } = filterConfig || {};

    // Convert to groups format for consistent processing
    const filterGroups = groups.length > 0 ? groups : (rules.length > 0 ? [{ rules }] : []);

    // Check if we have any filter groups or complex filters that need client-side processing
    const hasFilterGroups = filterGroups.length > 0;
    const hasMultipleGroups = filterGroups.length > 1;

    // Check if any group has complex filters
    const hasComplexFilters = filterGroups.some(group => {
      const groupRules = group.rules || [];
      return groupRules.some(r =>
        ['policy_type', 'active_policy_type', 'policy_status', 'policy_count', 'policy_expiration',
          'location', 'city', 'zip_code', 'email_domain'].includes(r.field) &&
        (r.value || ['is_empty', 'is_not_empty'].includes(r.operator))
      );
    });

    const needsClientSideFilter = hasMultipleGroups || hasComplexFilters;

    let recipients;
    let count;

    if (needsClientSideFilter) {
      // Fetch and filter recipients once, use for both count and breakdown
      recipients = await this.getRecipients(ownerId, filterConfig, { limit: 10000 });
      count = recipients.length;
    } else {
      // Fast path for no filters or single group with only account_status/state filters
      // Use getRecipients which now handles both formats
      recipients = await this.getRecipients(ownerId, filterConfig, { limit: 10000 });
      count = recipients.length;
    }

    // Build location breakdown from recipients
    const cityCounts = {};
    const titleCase = (str) => {
      if (!str) return '';
      return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    };

    recipients.forEach(account => {
      const rawState = (account.billing_state || '').trim();
      const rawCity = (account.billing_city || '').trim();

      if (rawCity && rawState) {
        const city = titleCase(rawCity);
        const state = rawState.length === 2 ? rawState.toUpperCase() : titleCase(rawState);
        const cityKey = `${city}, ${state}`;
        cityCounts[cityKey] = (cityCounts[cityKey] || 0) + 1;
      }
    });

    const cityBreakdown = Object.entries(cityCounts)
      .map(([city, cnt]) => ({ city, count: cnt }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      count,
      breakdown: {
        total: recipients.length,
        byCity: cityBreakdown
      }
    };
  },

  /**
   * Count recipients based on filter config with dynamic rules
   * @deprecated Use getRecipientStats instead for better performance
   */
  async countRecipients(ownerId, filterConfig) {
    const stats = await this.getRecipientStats(ownerId, filterConfig);
    return stats.count;
  },

  /**
   * Get location breakdown of recipients
   * @deprecated Use getRecipientStats instead for better performance
   */
  async getRecipientLocationBreakdown(ownerId, filterConfig) {
    const stats = await this.getRecipientStats(ownerId, filterConfig);
    return stats.breakdown;
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
