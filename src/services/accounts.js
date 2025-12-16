// src/services/accounts.js
import { supabase } from '../lib/supabase';

export const accountsService = {
  /**
   * Get all accounts for an owner
   */
  async getAll(ownerId, options = {}) {
    const { status, search, limit = 50, offset = 0 } = options;
    
    let query = supabase
      .from('accounts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('name')
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('account_status', status);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,person_email.ilike.%${search}%,email.ilike.%${search}%`);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
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

    const { data: policies, error: policiesError } = await supabase
      .from('policies')
      .select(`
        *,
        carrier:carriers(id, name)
      `)
      .eq('account_unique_id', accountId)
      .order('expiration_date', { ascending: false });
    
    if (policiesError) throw policiesError;

    return {
      ...account,
      policies
    };
  },

  /**
   * Get account with email history
   */
  async getByIdWithEmailHistory(ownerId, accountId) {
    const account = await this.getByIdWithPolicies(accountId);
    
    // Get email logs
    const { data: emailLogs, error: logsError } = await supabase
      .from('email_logs')
      .select(`
        *,
        template:email_templates(id, name),
        automation:automations(id, name)
      `)
      .eq('owner_id', ownerId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(20);
    
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
   */
  async search(ownerId, searchTerm, limit = 20) {
    const { data, error } = await supabase
      .from('accounts')
      .select('account_unique_id, name, person_email, email, account_status, primary_contact_first_name, primary_contact_last_name')
      .eq('owner_id', ownerId)
      .or(`name.ilike.%${searchTerm}%,person_email.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,primary_contact_first_name.ilike.%${searchTerm}%,primary_contact_last_name.ilike.%${searchTerm}%`)
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get accounts by status
   */
  async getByStatus(ownerId, status, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('account_status', status)
      .order('name')
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data;
  },

  /**
   * Get customers (active accounts)
   */
  async getCustomers(ownerId, options = {}) {
    return this.getByStatus(ownerId, 'customer', options);
  },

  /**
   * Get prospects
   */
  async getProspects(ownerId, options = {}) {
    return this.getByStatus(ownerId, 'prospect', options);
  },

  /**
   * Get prior customers
   */
  async getPriorCustomers(ownerId, options = {}) {
    return this.getByStatus(ownerId, 'prior_customer', options);
  },

  /**
   * Get accounts with expiring policies
   */
  async getWithExpiringPolicies(ownerId, daysOut = 45) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysOut);
    
    const { data, error } = await supabase
      .from('policies')
      .select(`
        policy_unique_id,
        policy_lob,
        expiration_date,
        policy_status,
        account:accounts!inner(
          account_unique_id,
          name,
          person_email,
          email,
          owner_id,
          primary_contact_first_name,
          primary_contact_last_name
        )
      `)
      .eq('accounts.owner_id', ownerId)
      .eq('policy_status', 'Active')
      .lte('expiration_date', futureDate.toISOString().split('T')[0])
      .gte('expiration_date', new Date().toISOString().split('T')[0])
      .order('expiration_date');
    
    if (error) throw error;
    return data;
  },

  /**
   * Get account counts by status
   */
  async getCounts(ownerId) {
    const { data, error } = await supabase
      .from('accounts')
      .select('account_status')
      .eq('owner_id', ownerId);
    
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
   */
  async getEligibleForAutomation(ownerId, filterConfig) {
    // This is a simplified version - in production, you'd build dynamic queries
    // based on the filter config structure
    
    let query = supabase
      .from('accounts')
      .select(`
        *,
        policies(*)
      `)
      .eq('owner_id', ownerId)
      .or('person_has_opted_out_of_email.is.null,person_has_opted_out_of_email.eq.false')
      .not('person_email', 'is', null);
    
    const { data, error } = await query;
    if (error) throw error;
    
    // Additional filtering would happen here based on filterConfig
    return data.filter(account => this.canReceiveMarketing(account));
  }
};

export default accountsService;
