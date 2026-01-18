// src/services/nps.js
// NPS (Net Promoter Score) Service
// Handles NPS calculation, trending, and survey response queries

import { supabase } from '../lib/supabase';
import { applyOwnerFilter, normalizeOwnerIds } from './utils/ownerFilter';

/**
 * NPS Category Mapping:
 * - Promoters: 4-5 stars (NPS 9-10)
 * - Passives: 3 stars (NPS 7-8)
 * - Detractors: 1-2 stars (NPS 0-6)
 *
 * NPS Score = % Promoters - % Detractors (range: -100 to +100)
 */

export const npsService = {
  /**
   * Get current NPS score and breakdown
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {Object} options - Query options (startDate, endDate)
   * @returns {Object} NPS metrics { nps_score, promoters, passives, detractors, total_responses, avg_rating, feedback_count }
   */
  async getCurrentNPS(ownerIds, options = {}) {
    const { startDate, endDate } = options;
    const ownerArray = normalizeOwnerIds(ownerIds);

    if (ownerArray.length === 0) {
      return {
        nps_score: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        total_responses: 0,
        avg_rating: 0,
        feedback_count: 0
      };
    }

    // Try RPC function first
    try {
      const { data, error } = await supabase.rpc('calculate_nps_stats', {
        p_owner_ids: ownerArray,
        p_start_date: startDate || null,
        p_end_date: endDate || null
      });

      if (!error && data && data.length > 0) {
        return {
          nps_score: parseFloat(data[0].nps_score) || 0,
          promoters: parseInt(data[0].promoters) || 0,
          passives: parseInt(data[0].passives) || 0,
          detractors: parseInt(data[0].detractors) || 0,
          total_responses: parseInt(data[0].total_responses) || 0,
          avg_rating: parseFloat(data[0].avg_rating) || 0,
          feedback_count: parseInt(data[0].feedback_count) || 0
        };
      }
    } catch (rpcError) {
      console.warn('RPC calculate_nps_stats failed, using fallback:', rpcError);
    }

    // Fallback: Calculate from accounts table directly
    return this._calculateNPSFallback(ownerIds, options);
  },

  /**
   * Fallback NPS calculation from accounts table
   * @private
   */
  async _calculateNPSFallback(ownerIds, options = {}) {
    const { startDate, endDate } = options;

    let query = supabase
      .from('accounts')
      .select('survey_stars, survey_feedback_text')
      .not('survey_stars', 'is', null)
      .not('survey_completed_at', 'is', null);

    query = applyOwnerFilter(query, ownerIds);

    if (startDate) {
      query = query.gte('survey_completed_at', startDate);
    }
    if (endDate) {
      query = query.lte('survey_completed_at', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        nps_score: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        total_responses: 0,
        avg_rating: 0,
        feedback_count: 0
      };
    }

    const promoters = data.filter(d => d.survey_stars >= 4).length;
    const passives = data.filter(d => d.survey_stars === 3).length;
    const detractors = data.filter(d => d.survey_stars <= 2).length;
    const total = data.length;
    const feedbackCount = data.filter(d => d.survey_feedback_text && d.survey_feedback_text.trim()).length;
    const avgRating = data.reduce((sum, d) => sum + d.survey_stars, 0) / total;

    const npsScore = total > 0
      ? ((promoters / total) * 100) - ((detractors / total) * 100)
      : 0;

    return {
      nps_score: Math.round(npsScore * 100) / 100,
      promoters,
      passives,
      detractors,
      total_responses: total,
      avg_rating: Math.round(avgRating * 100) / 100,
      feedback_count: feedbackCount
    };
  },

  /**
   * Get NPS trend over time
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {number} days - Number of days to fetch (default: 30)
   * @returns {Array} Array of { stat_date, nps_score, total_responses, promoters, passives, detractors }
   */
  async getNPSTrend(ownerIds, days = 30) {
    const ownerArray = normalizeOwnerIds(ownerIds);

    if (ownerArray.length === 0) {
      return [];
    }

    // Try RPC function first
    try {
      const { data, error } = await supabase.rpc('get_nps_trend', {
        p_owner_ids: ownerArray,
        p_days: days
      });

      if (!error && data) {
        return data.map(d => ({
          stat_date: d.stat_date,
          nps_score: parseFloat(d.nps_score) || 0,
          total_responses: parseInt(d.total_responses) || 0,
          promoters: parseInt(d.promoters) || 0,
          passives: parseInt(d.passives) || 0,
          detractors: parseInt(d.detractors) || 0,
          avg_rating: parseFloat(d.avg_rating) || 0,
          feedback_count: parseInt(d.feedback_count) || 0
        }));
      }
    } catch (rpcError) {
      console.warn('RPC get_nps_trend failed, using fallback:', rpcError);
    }

    // Fallback: Query nps_stats_daily table directly
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = supabase
      .from('nps_stats_daily')
      .select('*')
      .gte('stat_date', startDate.toISOString().split('T')[0])
      .order('stat_date', { ascending: true });

    query = applyOwnerFilter(query, ownerIds);

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(d => ({
      stat_date: d.stat_date,
      nps_score: parseFloat(d.nps_score) || 0,
      total_responses: d.total_responses || 0,
      promoters: d.promoters || 0,
      passives: d.passives || 0,
      detractors: d.detractors || 0,
      avg_rating: parseFloat(d.avg_rating) || 0,
      feedback_count: d.feedback_count || 0
    }));
  },

  /**
   * Get NPS comparison between periods
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {number} days - Period length in days
   * @returns {Object} { current, previous, change }
   */
  async getNPSComparison(ownerIds, days = 30) {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    const [current, previous] = await Promise.all([
      this.getCurrentNPS(ownerIds, {
        startDate: currentStart.toISOString(),
        endDate: now.toISOString()
      }),
      this.getCurrentNPS(ownerIds, {
        startDate: previousStart.toISOString(),
        endDate: currentStart.toISOString()
      })
    ]);

    const change = previous.total_responses > 0
      ? current.nps_score - previous.nps_score
      : 0;

    return {
      current,
      previous,
      change: Math.round(change * 100) / 100
    };
  },

  /**
   * Get recent survey responses
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {Object} options - { limit, category: 'promoter'|'passive'|'detractor'|null }
   * @returns {Array} Recent survey responses with account info
   */
  async getRecentResponses(ownerIds, options = {}) {
    const { limit = 20, category = null } = options;

    let query = supabase
      .from('accounts')
      .select(`
        account_unique_id,
        name,
        person_email,
        survey_stars,
        survey_feedback_text,
        survey_completed_at
      `)
      .not('survey_stars', 'is', null)
      .not('survey_completed_at', 'is', null)
      .order('survey_completed_at', { ascending: false })
      .limit(limit);

    query = applyOwnerFilter(query, ownerIds);

    // Filter by category
    if (category === 'promoter') {
      query = query.gte('survey_stars', 4);
    } else if (category === 'passive') {
      query = query.eq('survey_stars', 3);
    } else if (category === 'detractor') {
      query = query.lte('survey_stars', 2);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(d => ({
      ...d,
      category: d.survey_stars >= 4 ? 'promoter' : d.survey_stars === 3 ? 'passive' : 'detractor'
    }));
  },

  /**
   * Get survey response rate
   * @param {string|string[]} ownerIds - Owner ID(s) for filtering
   * @param {number} days - Days to calculate rate for
   * @returns {Object} { surveys_sent, surveys_completed, response_rate }
   */
  async getSurveyResponseRate(ownerIds, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Count emails sent with star rating (periodic review emails)
    let sentQuery = supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', startDate.toISOString());

    sentQuery = applyOwnerFilter(sentQuery, ownerIds);

    // Count survey completions
    let completedQuery = supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .not('survey_completed_at', 'is', null)
      .gte('survey_completed_at', startDate.toISOString());

    completedQuery = applyOwnerFilter(completedQuery, ownerIds);

    const [{ count: sentCount }, { count: completedCount }] = await Promise.all([
      sentQuery,
      completedQuery
    ]);

    const sent = sentCount || 0;
    const completed = completedCount || 0;
    const rate = sent > 0 ? (completed / sent) * 100 : 0;

    return {
      surveys_sent: sent,
      surveys_completed: completed,
      response_rate: Math.round(rate * 100) / 100
    };
  },

  /**
   * Get NPS score color based on value
   * @param {number} score - NPS score (-100 to +100)
   * @returns {string} Color code
   */
  getNPSColor(score) {
    if (score < 0) return '#ef4444';      // Red - Needs Improvement
    if (score < 30) return '#f59e0b';     // Yellow/Orange - Good
    if (score < 70) return '#22c55e';     // Green - Great
    return '#10b981';                      // Emerald - Excellent
  },

  /**
   * Get NPS label based on value
   * @param {number} score - NPS score (-100 to +100)
   * @returns {string} Label
   */
  getNPSLabel(score) {
    if (score < 0) return 'Needs Improvement';
    if (score < 30) return 'Good';
    if (score < 70) return 'Great';
    return 'Excellent';
  }
};

export default npsService;
