// src/utils/leadScore.js
// Shared lead scoring algorithm
// Used by ClientProfilePage (React) and replicated in sf-api Edge Function (Salesforce LWC)

const WEIGHTS = {
  emailOpens: 5,       // points per distinct email opened (max 25)
  emailClicks: 10,     // points per distinct email clicked (max 30)
  emailReplies: 15,    // points per distinct email replied (max 30)
  npsPromoter: 20,     // 4-5 stars
  npsPassive: 10,      // 3 stars
  npsDetractor: -10,   // 1-2 stars
  customerStatus: 15,  // active customer
  hasPolicy: 10,       // has at least one active policy
};

const MAX_POINTS = {
  emailOpens: 25,
  emailClicks: 30,
  emailReplies: 30,
  nps: 20,
  customerStatus: 15,
  hasPolicy: 10,
};

const MAX_TOTAL = MAX_POINTS.emailOpens + MAX_POINTS.emailClicks + MAX_POINTS.emailReplies
  + MAX_POINTS.nps + MAX_POINTS.customerStatus + MAX_POINTS.hasPolicy; // 130

/**
 * Calculate lead score from engagement data
 * @param {Object} params
 * @param {Array} params.emailLogs - Array of email log objects with first_opened_at, first_clicked_at, first_replied_at
 * @param {number|null} params.surveyStars - NPS star rating (1-5) or null
 * @param {string} params.accountStatus - Account status string (e.g. 'Customer', 'Prospect')
 * @param {number} params.activePolicyCount - Number of active policies
 * @returns {{ score: number, grade: string, breakdown: Object }}
 */
export function calculateLeadScore({ emailLogs = [], surveyStars = null, accountStatus = '', activePolicyCount = 0 }) {
  const breakdown = {};

  // Email engagement — count distinct emails, not repeat events
  const opened = emailLogs.filter(l => l.first_opened_at).length;
  const clicked = emailLogs.filter(l => l.first_clicked_at).length;
  const replied = emailLogs.filter(l => l.first_replied_at).length;

  const openPoints = Math.min(MAX_POINTS.emailOpens, opened * WEIGHTS.emailOpens);
  const clickPoints = Math.min(MAX_POINTS.emailClicks, clicked * WEIGHTS.emailClicks);
  const replyPoints = Math.min(MAX_POINTS.emailReplies, replied * WEIGHTS.emailReplies);

  breakdown.emailEngagement = {
    opens: openPoints,
    clicks: clickPoints,
    replies: replyPoints,
    total: openPoints + clickPoints + replyPoints,
  };

  // NPS rating
  if (surveyStars && surveyStars >= 4) {
    breakdown.nps = WEIGHTS.npsPromoter;
  } else if (surveyStars === 3) {
    breakdown.nps = WEIGHTS.npsPassive;
  } else if (surveyStars && surveyStars <= 2) {
    breakdown.nps = WEIGHTS.npsDetractor;
  } else {
    breakdown.nps = 0;
  }

  // Customer status
  const isCustomer = accountStatus?.toLowerCase() === 'customer';
  breakdown.customerStatus = isCustomer ? WEIGHTS.customerStatus : 0;

  // Active policies
  breakdown.hasPolicy = activePolicyCount > 0 ? WEIGHTS.hasPolicy : 0;

  // Raw score
  const rawScore = breakdown.emailEngagement.total + breakdown.nps + breakdown.customerStatus + breakdown.hasPolicy;

  // Normalize to 0-100
  const score = Math.round((Math.max(0, rawScore) / MAX_TOTAL) * 100);

  // Letter grade
  let grade;
  if (score >= 80) grade = 'A';
  else if (score >= 60) grade = 'B';
  else if (score >= 40) grade = 'C';
  else if (score >= 20) grade = 'D';
  else grade = 'F';

  return { score, grade, rawScore, maxPossible: MAX_TOTAL, breakdown };
}

/**
 * Get display color for a lead score grade
 * @param {string} grade - Letter grade (A-F)
 * @param {Object} theme - Theme object with success, warning, danger colors
 * @returns {string} Color value
 */
export function getGradeColor(grade, theme) {
  switch (grade) {
    case 'A': return theme.success || '#2e844a';
    case 'B': return theme.success || '#3ba755';
    case 'C': return theme.warning || '#fe9339';
    case 'D': return theme.danger || '#ea001e';
    case 'F': return theme.danger || '#c23934';
    default: return theme.textMuted || '#999';
  }
}
