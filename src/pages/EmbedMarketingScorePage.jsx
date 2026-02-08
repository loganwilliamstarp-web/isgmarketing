import { useParams } from 'react-router-dom';
import { useAccountWithPolicies } from '../hooks/useAccounts';
import { useAccountEmailLogs } from '../hooks/useEmailLogs';
import { calculateLeadScore, getGradeColor } from '../utils/leadScore';

const theme = {
  success: '#2e844a',
  warning: '#fe9339',
  danger: '#ea001e',
  textMuted: '#999',
};

const EmbedMarketingScorePage = () => {
  const { accountId } = useParams();
  const { data: client, isLoading: clientLoading } = useAccountWithPolicies(accountId);
  const { data: emailLogs, isLoading: emailsLoading } = useAccountEmailLogs(accountId);

  const isLoading = clientLoading || emailsLoading;

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <div style={{ color: '#706e6b', fontSize: '13px', marginTop: '8px' }}>Loading...</div>
        </div>
        <style>{spinnerCSS}</style>
      </div>
    );
  }

  if (!client) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>No account data found.</div>
      </div>
    );
  }

  const activePolicyCount = (client.policies || []).filter(
    p => p.status?.toLowerCase() === 'active' || p.status?.toLowerCase() === 'inforce'
  ).length;

  const leadScore = calculateLeadScore({
    emailLogs: emailLogs || [],
    surveyStars: client.survey_stars || null,
    accountStatus: client.account_status || '',
    activePolicyCount,
  });

  const gradeColor = getGradeColor(leadScore.grade, theme);
  const hasData = (emailLogs?.length > 0) || client.survey_stars;

  const npsCategory = client.survey_stars >= 4 ? 'Promoter'
    : client.survey_stars === 3 ? 'Passive'
    : client.survey_stars && client.survey_stars <= 2 ? 'Detractor'
    : null;

  const npsBgColor = npsCategory === 'Promoter' ? '#e3f3e3'
    : npsCategory === 'Passive' ? '#fef3c7'
    : npsCategory === 'Detractor' ? '#fce4e4'
    : null;

  const npsTextColor = npsCategory === 'Promoter' ? '#2e844a'
    : npsCategory === 'Passive' ? '#b45309'
    : npsCategory === 'Detractor' ? '#ea001e'
    : null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerIcon}>📊</span>
          <span style={styles.headerText}>Marketing Score</span>
        </div>

        {!hasData ? (
          <div style={styles.emptyState}>No engagement data yet</div>
        ) : (
          <>
            {/* Score Circle */}
            <div style={styles.scoreSection}>
              <div style={{
                ...styles.scoreCircle,
                border: `3px solid ${gradeColor}`,
              }}>
                <div style={{ ...styles.scoreNumber, color: gradeColor }}>{leadScore.score}</div>
                <div style={{ ...styles.scoreGrade, color: gradeColor }}>{leadScore.grade}</div>
              </div>
            </div>

            {/* NPS Badge */}
            {npsCategory && (
              <div style={styles.npsSection}>
                <div style={{ fontSize: '20px', color: '#fbbf24', letterSpacing: '2px', marginBottom: '6px' }}>
                  {'★'.repeat(client.survey_stars)}
                  {'☆'.repeat(5 - client.survey_stars)}
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: npsBgColor,
                  color: npsTextColor,
                }}>
                  {npsCategory}
                </span>
              </div>
            )}

            {/* Score Breakdown */}
            <div style={styles.breakdown}>
              {[
                { label: 'Email Engagement', value: leadScore.breakdown.emailEngagement.total, max: 85 },
                { label: 'NPS Rating', value: leadScore.breakdown.nps, max: 20 },
                { label: 'Customer Status', value: leadScore.breakdown.customerStatus, max: 15 },
                { label: 'Active Policies', value: leadScore.breakdown.hasPolicy, max: 10 },
              ].map(item => (
                <div key={item.label} style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>{item.label}</span>
                  <span style={{
                    ...styles.breakdownValue,
                    color: item.value > 0 ? '#3e3e3c' : '#999',
                  }}>
                    {item.value}/{item.max}
                  </span>
                </div>
              ))}
            </div>

            {/* Feedback */}
            {client.survey_feedback_text && (
              <div style={styles.feedbackSection}>
                <div style={styles.feedbackLabel}>FEEDBACK</div>
                <div style={styles.feedbackText}>"{client.survey_feedback_text}"</div>
                {client.survey_date && (
                  <div style={styles.feedbackDate}>
                    {new Date(client.survey_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <style>{spinnerCSS}</style>
    </div>
  );
};

const spinnerCSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  body { margin: 0; background: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
`;

const styles = {
  container: {
    padding: '0',
    minHeight: '100%',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #e2e8f0',
    borderTopColor: '#0070d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '4px',
    border: '1px solid #d8dde6',
    padding: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e5e5',
    marginBottom: '16px',
  },
  headerIcon: {
    fontSize: '16px',
  },
  headerText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#3e3e3c',
  },
  scoreSection: {
    textAlign: 'center',
    marginBottom: '12px',
  },
  scoreCircle: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
  },
  scoreNumber: {
    fontSize: '28px',
    fontWeight: '700',
    lineHeight: 1,
  },
  scoreGrade: {
    fontSize: '14px',
    fontWeight: '600',
  },
  npsSection: {
    textAlign: 'center',
    marginBottom: '16px',
  },
  breakdown: {
    padding: '12px',
    backgroundColor: '#f3f3f3',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    marginBottom: '4px',
  },
  breakdownLabel: {
    color: '#706e6b',
  },
  breakdownValue: {
    fontWeight: '500',
  },
  feedbackSection: {
    padding: '12px',
    backgroundColor: '#f3f3f3',
    borderRadius: '6px',
  },
  feedbackLabel: {
    fontSize: '10px',
    color: '#706e6b',
    fontWeight: '600',
    marginBottom: '6px',
    letterSpacing: '0.5px',
  },
  feedbackText: {
    fontSize: '13px',
    color: '#3e3e3c',
    fontStyle: 'italic',
    lineHeight: '1.4',
  },
  feedbackDate: {
    fontSize: '11px',
    color: '#999',
    marginTop: '6px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '24px 0',
    fontSize: '13px',
    color: '#706e6b',
  },
};

export default EmbedMarketingScorePage;
