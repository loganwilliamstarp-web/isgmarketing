// Tests for the shared lead scoring algorithm.

import { describe, expect, it } from 'vitest';
import { calculateLeadScore } from './leadScore';

describe('calculateLeadScore', () => {
  it('scores an unengaged prospect as F', () => {
    const { score, grade, rawScore } = calculateLeadScore({});
    expect(rawScore).toBe(0);
    expect(score).toBe(0);
    expect(grade).toBe('F');
  });

  it('caps email engagement points', () => {
    const emailLogs = Array.from({ length: 20 }, () => ({
      first_opened_at: 'x', first_clicked_at: 'x', first_replied_at: 'x',
    }));
    const { breakdown } = calculateLeadScore({ emailLogs });
    expect(breakdown.emailEngagement).toEqual({ opens: 25, clicks: 30, replies: 30, total: 85 });
  });

  it('maps NPS stars to promoter/passive/detractor points', () => {
    expect(calculateLeadScore({ surveyStars: 5 }).breakdown.nps).toBe(20);
    expect(calculateLeadScore({ surveyStars: 3 }).breakdown.nps).toBe(10);
    expect(calculateLeadScore({ surveyStars: 1 }).breakdown.nps).toBe(-10);
    expect(calculateLeadScore({ surveyStars: null }).breakdown.nps).toBe(0);
  });

  it('never returns a negative normalized score', () => {
    const { score, rawScore } = calculateLeadScore({ surveyStars: 1 });
    expect(rawScore).toBe(-10);
    expect(score).toBe(0);
  });

  it('scores a fully engaged active customer as A', () => {
    const emailLogs = Array.from({ length: 10 }, () => ({
      first_opened_at: 'x', first_clicked_at: 'x', first_replied_at: 'x',
    }));
    const { score, grade } = calculateLeadScore({
      emailLogs,
      surveyStars: 5,
      accountStatus: 'Customer',
      activePolicyCount: 2,
    });
    expect(score).toBe(100);
    expect(grade).toBe('A');
  });

  it('is case-insensitive on customer status', () => {
    expect(calculateLeadScore({ accountStatus: 'CUSTOMER' }).breakdown.customerStatus).toBe(15);
    expect(calculateLeadScore({ accountStatus: 'Prospect' }).breakdown.customerStatus).toBe(0);
  });
});
