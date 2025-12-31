// src/services/accounts.js
import { supabase } from '../lib/supabase';
import { applyOwnerFilter, getFirstOwnerId, normalizeOwnerIds } from './utils/ownerFilter';

export const accountsService = {
  /**
   * Get paginated accounts for owner(s) with policy counts
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getAll(ownerIds, options = {}) {
    const { status, search, limit = 25, offset = 0, expiring = false } = options;

    // First get total count (without pagination)
    let countQuery = supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true });
    countQuery = applyOwnerFilter(countQuery, ownerIds);
    
    if (status) {
      // Map UI filter values to database values
      let dbStatus = status;
      if (status.toLowerCase() === 'prior') dbStatus = 'prior_customer';
      
      countQuery = countQuery.ilike('account_status', dbStatus);
    }
    
    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }
    
    const { count: totalCount, error: countError } = await countQuery;
    if (countError) throw countError;
    
    // Get paginated accounts
    let query = supabase
      .from('accounts')
      .select('*')
      .order('name')
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);
    
    if (status) {
      // Map UI filter values to database values
      let dbStatus = status;
      if (status.toLowerCase() === 'prior') dbStatus = 'prior_customer';
      
      query = query.ilike('account_status', dbStatus);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }
    
    const { data: accounts, error } = await query;
    if (error) throw error;
    
    if (!accounts || accounts.length === 0) {
      return { accounts: [], total: totalCount || 0 };
    }
    
    // Get policies for these accounts (including expiration dates)
    const accountIds = accounts.map(a => a.account_unique_id).filter(Boolean);
    
    // Calculate date range for expiring policies (next 30 days)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const futureStr = thirtyDaysFromNow.toISOString().split('T')[0];
    
    if (accountIds.length > 0) {
      const { data: policies, error: policyError } = await supabase
        .from('policies')
        .select('account_id, policy_lob, policy_status, expiration_date')
        .in('account_id', accountIds);
      
      if (!policyError && policies) {
        // Group policies by account
        const policyMap = {};
        policies.forEach(p => {
          if (!policyMap[p.account_id]) {
            policyMap[p.account_id] = [];
          }
          
          // Check if this policy is expiring in next 30 days
          const isExpiring = p.expiration_date && 
            p.expiration_date >= todayStr && 
            p.expiration_date <= futureStr;
          
          policyMap[p.account_id].push({
            policy_type: p.policy_lob,
            status: p.policy_status?.toLowerCase() || 'unknown',
            expiration_date: p.expiration_date,
            is_expiring: isExpiring
          });
        });
        
        // Attach policies to accounts
        accounts.forEach(account => {
          account.policies = policyMap[account.account_unique_id] || [];
          account.policy_count = account.policies.length;
          account.has_expiring_policy = account.policies.some(p => p.is_expiring);
          account.expiring_policy_count = account.policies.filter(p => p.is_expiring).length;
        });
      }
    }
    
    // If filtering by expiring, we need to filter client-side and adjust count
    if (expiring) {
      const expiringAccounts = accounts.filter(a => a.has_expiring_policy);
      return { accounts: expiringAccounts, total: expiringAccounts.length, isExpiringFilter: true };
    }
    
    return { accounts, total: totalCount || 0 };
  },

  /**
   * Get account stats summary - counts ALL accounts for owner(s) using proper count queries
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getStats(ownerIds) {
    // Use count queries instead of fetching all rows (Supabase has 1000 row default limit)

    // Total count
    let totalQuery = supabase.from('accounts').select('*', { count: 'exact', head: true });
    totalQuery = applyOwnerFilter(totalQuery, ownerIds);
    const { count: totalCount, error: totalError } = await totalQuery;

    if (totalError) throw totalError;

    // Count by status - use ilike for case-insensitive matching
    let customerQuery = supabase.from('accounts').select('*', { count: 'exact', head: true }).ilike('account_status', 'customer');
    customerQuery = applyOwnerFilter(customerQuery, ownerIds);
    const { count: customerCount } = await customerQuery;

    let prospectQuery = supabase.from('accounts').select('*', { count: 'exact', head: true }).ilike('account_status', 'prospect');
    prospectQuery = applyOwnerFilter(prospectQuery, ownerIds);
    const { count: prospectCount } = await prospectQuery;

    // Match "prior_customer" or "prior"
    let priorQuery = supabase.from('accounts').select('*', { count: 'exact', head: true }).ilike('account_status', 'prior_customer');
    priorQuery = applyOwnerFilter(priorQuery, ownerIds);
    const { count: priorCount } = await priorQuery;

    let leadQuery = supabase.from('accounts').select('*', { count: 'exact', head: true }).ilike('account_status', 'lead');
    leadQuery = applyOwnerFilter(leadQuery, ownerIds);
    const { count: leadCount } = await leadQuery;
    
    // For expiring policies count, we'll estimate based on a sample
    // This avoids hitting row limits when there are many expiring policies
    let expiringAccountCount = 0;
    
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const futureDate = thirtyDaysFromNow.toISOString().split('T')[0];
    
    // Count expiring policies first
    const { count: expiringPolicyCount } = await supabase
      .from('policies')
      .select('*', { count: 'exact', head: true })
      .gte('expiration_date', today)
      .lte('expiration_date', futureDate);
    
    // If there are expiring policies, get unique account IDs (up to 1000)
    // and count how many belong to this owner
    if (expiringPolicyCount && expiringPolicyCount > 0) {
      // Get distinct account_ids with expiring policies
      const { data: expiringPolicies } = await supabase
        .from('policies')
        .select('account_id')
        .gte('expiration_date', today)
        .lte('expiration_date', futureDate)
        .limit(5000); // Get more to improve accuracy
      
      if (expiringPolicies && expiringPolicies.length > 0) {
        // Get unique account IDs
        const uniqueAccountIds = [...new Set(expiringPolicies.map(p => p.account_id).filter(Boolean))];
        
        if (uniqueAccountIds.length > 0) {
          // Count in batches of 100 to avoid query limits
          let ownerExpiringCount = 0;
          const batchSize = 100;

          for (let i = 0; i < uniqueAccountIds.length; i += batchSize) {
            const batch = uniqueAccountIds.slice(i, i + batchSize);
            let batchQuery = supabase.from('accounts').select('*', { count: 'exact', head: true }).in('account_unique_id', batch);
            batchQuery = applyOwnerFilter(batchQuery, ownerIds);
            const { count } = await batchQuery;

            ownerExpiringCount += (count || 0);
          }

          expiringAccountCount = ownerExpiringCount;
        }
      }
    }
    
    return {
      Customer: customerCount || 0,
      Prospect: prospectCount || 0,
      Prior: priorCount || 0,
      Lead: leadCount || 0,
      total: totalCount || 0,
      expiring: expiringAccountCount
    };
  },

  /**
   * Get account by ID
   */
  async getById(accountId) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('account_unique_id', accountId)
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get account with policies
   */
  async getByIdWithPolicies(accountId) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('account_unique_id', accountId)
      .single();
    
    if (accountError) throw accountError;
    if (!account) return null;

    // Get policies - use account_unique_id to match account_id in policies table
    // Sort by expiration date descending (furthest expiration first)
    const { data: policies, error: policiesError } = await supabase
      .from('policies')
      .select('*')
      .eq('account_id', accountId)
      .order('expiration_date', { ascending: false });

    if (policiesError) {
      console.error('Error fetching policies:', policiesError);
      return { ...account, policies: [] };
    }

    // If we have policies, fetch carrier names
    if (policies && policies.length > 0) {
      const carrierIds = [...new Set(policies.map(p => p.carrier_id).filter(Boolean))];

      if (carrierIds.length > 0) {
        const { data: carriers, error: carrierError } = await supabase
          .from('carriers')
          .select('id, name')
          .in('id', carrierIds);

        if (carriers && carriers.length > 0) {
          const carrierMap = {};
          carriers.forEach(c => {
            carrierMap[c.id] = c.name;
          });

          // Attach carrier name to each policy
          policies.forEach(p => {
            if (p.carrier_id && carrierMap[p.carrier_id]) {
              p.carrier = { name: carrierMap[p.carrier_id] };
            }
          });
        }
      }
    }

    return {
      ...account,
      policies: policies || []
    };
  },

  /**
   * Get account with email history
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByIdWithEmailHistory(ownerIds, accountId) {
    const account = await this.getByIdWithPolicies(accountId);

    // Get email logs
    let logsQuery = supabase
      .from('email_logs')
      .select(`
        *,
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(20);
    logsQuery = applyOwnerFilter(logsQuery, ownerIds);
    const { data: emailLogs, error: logsError } = await logsQuery;
    
    if (logsError) throw logsError;

    // Get enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('automation_enrollments')
      .select(`
        *,
        automation:automations(id, name, category)
      `)
      .eq('account_id', accountId)
      .order('enrolled_at', { ascending: false });
    
    if (enrollError) throw enrollError;

    return {
      ...account,
      emailLogs,
      enrollments
    };
  },

  /**
   * Search accounts
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async search(ownerIds, searchTerm, limit = 20) {
    let query = supabase
      .from('accounts')
      .select('account_unique_id, name, person_email, email, account_status, primary_contact_first_name, primary_contact_last_name')
      .or(`name.ilike.%${searchTerm}%,person_email.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,primary_contact_first_name.ilike.%${searchTerm}%,primary_contact_last_name.ilike.%${searchTerm}%`)
      .limit(limit);
    query = applyOwnerFilter(query, ownerIds);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get accounts by status
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getByStatus(ownerIds, status, options = {}) {
    const { limit = 50, offset = 0 } = options;

    let query = supabase
      .from('accounts')
      .select('*')
      .eq('account_status', status)
      .order('name')
      .range(offset, offset + limit - 1);
    query = applyOwnerFilter(query, ownerIds);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get customers (active accounts)
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getCustomers(ownerIds, options = {}) {
    return this.getByStatus(ownerIds, 'customer', options);
  },

  /**
   * Get prospects
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getProspects(ownerIds, options = {}) {
    return this.getByStatus(ownerIds, 'prospect', options);
  },

  /**
   * Get prior customers
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getPriorCustomers(ownerIds, options = {}) {
    return this.getByStatus(ownerIds, 'prior_customer', options);
  },

  /**
   * Get accounts with expiring policies
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getWithExpiringPolicies(ownerIds, daysOut = 45) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysOut);
    const ownerIdsArray = normalizeOwnerIds(ownerIds);

    const { data, error } = await supabase
      .from('policies')
      .select(`
        policy_unique_id,
        policy_lob,
        expiration_date,
        policy_status,
        account_id,
        account:accounts!policies_account_id_fkey(
          account_unique_id,
          name,
          person_email,
          email,
          owner_id,
          primary_contact_first_name,
          primary_contact_last_name
        )
      `)
      .eq('policy_status', 'Active')
      .lte('expiration_date', futureDate.toISOString().split('T')[0])
      .gte('expiration_date', new Date().toISOString().split('T')[0])
      .order('expiration_date');

    if (error) throw error;

    // Filter by owner_id on the account side
    return data.filter(p => p.account?.owner_id && ownerIdsArray.includes(p.account.owner_id));
  },

  /**
   * Get account counts by status
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getCounts(ownerIds) {
    let query = supabase.from('accounts').select('account_status');
    query = applyOwnerFilter(query, ownerIds);
    const { data, error } = await query;

    if (error) throw error;

    const counts = {
      total: data.length,
      customer: 0,
      prospect: 0,
      prior_customer: 0,
      other: 0
    };

    data.forEach(a => {
      const status = a.account_status?.toLowerCase().replace(' ', '_') || 'other';
      if (counts[status] !== undefined) {
        counts[status]++;
      } else {
        counts.other++;
      }
    });

    return counts;
  },

  /**
   * Get email address for account
   */
  getEmail(account) {
    return account.person_email || account.email;
  },

  /**
   * Get display name for account
   */
  getDisplayName(account) {
    if (account.primary_contact_first_name) {
      return `${account.primary_contact_first_name} ${account.primary_contact_last_name || ''}`.trim();
    }
    return account.name;
  },

  /**
   * Check if account can receive marketing emails
   */
  canReceiveMarketing(account) {
    return (
      account.user_subscribed_to_marketing !== false &&
      account.person_has_opted_out_of_email !== true &&
      (account.person_email || account.email)
    );
  },

  /**
   * Get accounts eligible for automation
   * @param {string|string[]} ownerIds - Single owner ID or array of owner IDs
   */
  async getEligibleForAutomation(ownerIds, filterConfig) {
    // Get accounts first
    let query = supabase
      .from('accounts')
      .select('*')
      .or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false')
      .not('person_email', 'is', null);
    query = applyOwnerFilter(query, ownerIds);

    const { data: accounts, error } = await query;
    if (error) throw error;
    
    // Get policies separately for each account if needed
    const accountIds = accounts.map(a => a.account_unique_id);
    const { data: policies, error: policyError } = await supabase
      .from('policies')
      .select('*')
      .in('account_id', accountIds);
    
    if (policyError) throw policyError;
    
    // Attach policies to accounts
    const accountsWithPolicies = accounts.map(account => ({
      ...account,
      policies: policies.filter(p => p.account_id === account.account_unique_id)
    }));
    
    // Additional filtering would happen here based on filterConfig
    return accountsWithPolicies.filter(account => this.canReceiveMarketing(account));
  }
};

export default accountsService;
