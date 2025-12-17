// src/hooks/index.js

// Templates
export {
  useTemplates,
  useTemplate,
  useTemplateByKey,
  useTemplatesByCategory,
  useTemplateCategories,
  useTemplateMutations
} from './useTemplates';

// Automations
export {
  useAutomations,
  useAutomationsWithStats,
  useAutomation,
  useAutomationWithDetails,
  useAutomationByKey,
  useActiveAutomations,
  useAutomationCategories,
  useAutomationMutations
} from './useAutomations';

// Enrollments
export {
  useAutomationEnrollments,
  useAccountEnrollments,
  useEnrollment,
  useEnrollmentStats,
  useEnrollmentHistory,
  useCanEnroll,
  useReadyEnrollments,
  useEnrollmentMutations
} from './useEnrollments';

// Email Logs
export {
  useEmailLogs,
  useEmailLog,
  useEmailLogWithEvents,
  useAccountEmailLogs,
  useAutomationEmailLogs,
  useRecentOpens,
  useRecentClicks,
  useBounces,
  useEmailStats,
  useDailyStats,
  useComparisonStats,
  useEmailEvents,
  useEmailLogMutations
} from './useEmailLogs';

// Dashboard
export {
  useDashboard,
  useQuickStats,
  useAutomationStatsOverview,
  useEmailPerformanceChart,
  useTopAutomations,
  useAccountsNeedingAttention,
  useLiveStats
} from './useDashboard';

// User Settings
export {
  useUserSettings,
  useUserSettingsWithUser,
  useSignatureHtml,
  useUserSettingsMutations
} from './useUserSettings';

// Accounts
export {
  useAccounts,
  useAccount,
  useAccountWithPolicies,
  useAccountWithEmailHistory,
  useAccountSearch,
  useCustomers,
  useProspects,
  usePriorCustomers,
  useExpiringPolicies,
  useAccountCounts,
  useAccountStats
} from './useAccounts';

// Activity
export {
  useRecentActivity,
  useAccountActivity,
  useAutomationActivity,
  useActivityByType,
  useActivityStats,
  useActivityMutations
} from './useActivity';

// Scheduled Emails
export {
  useScheduledEmails,
  useUpcomingEmails,
  useScheduledEmail,
  useScheduledEmailStats,
  useScheduledEmailMutations
} from './useScheduledEmails';

// Unsubscribes
export {
  useUnsubscribes,
  useEmailUnsubscribes,
  useIsEmailSuppressed,
  useUnsubscribeStats,
  useUnsubscribeMutations,
  useEmailSuppression
} from './useUnsubscribes';
