// src/services/trial.js
import { supabase } from '../lib/supabase';

// Personal email domains that cannot start a trial (need business email)
const EXCLUDED_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'yandex.com',
  'mail.com',
  'gmx.com',
  'gmx.net'
];

/**
 * Extract domain from email address
 */
function getEmailDomain(email) {
  if (!email) return null;
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Check if email domain is a personal/excluded domain
 */
function isExcludedDomain(email) {
  const domain = getEmailDomain(email);
  return domain ? EXCLUDED_DOMAINS.includes(domain) : true;
}

export const trialService = {
  /**
   * Validate if an email can start a trial
   * Returns { valid: true } or { valid: false, reason: string }
   */
  validateTrialEmail(email) {
    const domain = getEmailDomain(email);

    if (!domain) {
      return { valid: false, reason: 'Invalid email address' };
    }

    if (isExcludedDomain(email)) {
      return {
        valid: false,
        reason: 'A business email is required to start a trial. Personal email addresses (Gmail, Yahoo, etc.) cannot be used because we need to verify your sending domain.'
      };
    }

    return { valid: true, domain };
  },

  /**
   * Check if there's an existing active trial for a domain
   * Returns the trial info if found, null otherwise
   */
  async findExistingTrialForDomain(domain) {
    // Profile name is derived from email domain (e.g., "acme.com" -> profile "acme.com")
    // We look for any user with an active trial and matching profile_name
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('user_settings')
      .select('user_id, profile_name, trial_ends_at, is_trial_agency_admin')
      .eq('profile_name', domain)
      .gt('trial_ends_at', now)
      .limit(1);

    if (error) throw error;

    return data && data.length > 0 ? data[0] : null;
  },

  /**
   * Start a 30-day trial for a user
   * If user's domain already has an active trial, they join as regular user
   * If not, they start a new trial as trial agency admin
   */
  async startTrial(userId, email, profileName) {
    const validation = this.validateTrialEmail(email);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const domain = validation.domain;
    const now = new Date();

    // Check for existing trial on this domain
    const existingTrial = await this.findExistingTrialForDomain(domain);

    let endsAt;
    let isTrialAgencyAdmin;

    if (existingTrial) {
      // Join existing trial - use their end date, not agency admin
      endsAt = new Date(existingTrial.trial_ends_at);
      isTrialAgencyAdmin = false;
    } else {
      // Start new trial - 30 days, become agency admin
      endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      isTrialAgencyAdmin = true;
    }

    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        profile_name: profileName || domain,
        trial_started_at: now.toISOString(),
        trial_ends_at: endsAt.toISOString(),
        is_trial_agency_admin: isTrialAgencyAdmin,
        updated_at: now.toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select('trial_started_at, trial_ends_at, is_trial_agency_admin')
      .single();

    if (error) throw error;

    const daysLeft = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)));

    return {
      startedAt: data.trial_started_at,
      endsAt: data.trial_ends_at,
      daysLeft,
      isExpired: false,
      isTrialAgencyAdmin: data.is_trial_agency_admin,
      joinedExisting: !!existingTrial
    };
  },

  /**
   * Get trial status for a user
   * Returns null if user has no trial, otherwise returns trial info
   */
  async getTrialStatus(userId) {
    const { data, error } = await supabase
      .from('user_settings')
      .select('trial_started_at, trial_ends_at, is_trial_agency_admin')
      .eq('user_id', userId)
      .single();

    // PGRST116 = no rows returned, which is fine - user just hasn't started trial
    if (error && error.code !== 'PGRST116') throw error;
    if (!data?.trial_ends_at) return null;

    const now = new Date();
    const endsAt = new Date(data.trial_ends_at);
    const daysLeft = Math.max(0, Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)));

    return {
      startedAt: data.trial_started_at,
      endsAt: data.trial_ends_at,
      daysLeft,
      isExpired: endsAt <= now,
      isTrialAgencyAdmin: data.is_trial_agency_admin || false
    };
  },

  /**
   * Check if email domain is excluded (personal email)
   */
  isPersonalEmail(email) {
    return isExcludedDomain(email);
  },

  /**
   * Get the domain from an email
   */
  getEmailDomain
};

export default trialService;
