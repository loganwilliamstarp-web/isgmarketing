// src/services/trial.js
import { supabase } from '../lib/supabase';

export const trialService = {
  /**
   * Start a 30-day trial for a user
   * Creates or updates the user_settings record with trial dates
   */
  async startTrial(userId) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        trial_started_at: now.toISOString(),
        trial_ends_at: endsAt.toISOString(),
        updated_at: now.toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select('trial_started_at, trial_ends_at')
      .single();

    if (error) throw error;

    return {
      startedAt: data.trial_started_at,
      endsAt: data.trial_ends_at,
      daysLeft: 30,
      isExpired: false
    };
  },

  /**
   * Get trial status for a user
   * Returns null if user has no trial, otherwise returns trial info
   */
  async getTrialStatus(userId) {
    const { data, error } = await supabase
      .from('user_settings')
      .select('trial_started_at, trial_ends_at')
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
      isExpired: endsAt <= now
    };
  }
};

export default trialService;
