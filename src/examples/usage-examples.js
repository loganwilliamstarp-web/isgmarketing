// USAGE EXAMPLES
// These examples show how to use the services and hooks in your components

// ============================================
// EXAMPLE 1: Dashboard Page
// ============================================
/*
import { useDashboard, useQuickStats } from '../hooks';

function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  const { 
    emailStats, 
    emailChanges, 
    recentActivity, 
    scheduledEmails,
    recentOpens,
    accountCounts 
  } = data;
  
  return (
    <div>
      <StatsCards stats={emailStats} changes={emailChanges} />
      <RecentActivity activity={recentActivity} />
      <UpcomingEmails emails={scheduledEmails} />
      <AccountCounts counts={accountCounts} />
    </div>
  );
}
*/

// ============================================
// EXAMPLE 2: Automations List Page
// ============================================
/*
import { useAutomationsWithStats, useAutomationMutations } from '../hooks';

function AutomationsPage() {
  const { data: automations, isLoading } = useAutomationsWithStats();
  const { activateAutomation, pauseAutomation } = useAutomationMutations();
  
  const handleToggleStatus = (automation) => {
    if (automation.status === 'Active') {
      pauseAutomation.mutate(automation.id);
    } else {
      activateAutomation.mutate(automation.id);
    }
  };
  
  return (
    <div>
      {automations?.map(automation => (
        <AutomationCard 
          key={automation.id}
          automation={automation}
          onToggle={() => handleToggleStatus(automation)}
        />
      ))}
    </div>
  );
}
*/

// ============================================
// EXAMPLE 3: Automation Detail Page
// ============================================
/*
import { useParams } from 'react-router-dom';
import { 
  useAutomationWithDetails, 
  useAutomationEnrollments,
  useAutomationMutations 
} from '../hooks';

function AutomationDetailPage() {
  const { automationId } = useParams();
  
  const { data: automation, isLoading } = useAutomationWithDetails(automationId);
  const { data: enrollments } = useAutomationEnrollments(automationId);
  const { updateNodes, updateFilters } = useAutomationMutations();
  
  const handleSaveWorkflow = (nodes) => {
    updateNodes.mutate({ automationId, nodes });
  };
  
  const handleSaveFilters = (filterConfig) => {
    updateFilters.mutate({ automationId, filterConfig });
  };
  
  return (
    <div>
      <AutomationHeader automation={automation} />
      <AutomationStats stats={automation?.emailSummary} />
      <WorkflowBuilder nodes={automation?.nodes} onSave={handleSaveWorkflow} />
      <FilterBuilder filters={automation?.filter_config} onSave={handleSaveFilters} />
      <EnrollmentsList enrollments={enrollments} />
    </div>
  );
}
*/

// ============================================
// EXAMPLE 4: Templates Page
// ============================================
/*
import { useTemplates, useTemplateMutations, useTemplateCategories } from '../hooks';
import { useState } from 'react';

function TemplatesPage() {
  const [category, setCategory] = useState(null);
  
  const { data: templates, isLoading } = useTemplates({ category });
  const { data: categories } = useTemplateCategories();
  const { updateTemplate, duplicateTemplate, deleteTemplate } = useTemplateMutations();
  
  const handleSave = (templateId, updates) => {
    updateTemplate.mutate({ templateId, updates });
  };
  
  const handleDuplicate = (templateId) => {
    duplicateTemplate.mutate(templateId);
  };
  
  const handleDelete = (templateId) => {
    if (confirm('Delete this template?')) {
      deleteTemplate.mutate(templateId);
    }
  };
  
  return (
    <div>
      <CategoryFilter 
        categories={categories} 
        selected={category} 
        onChange={setCategory} 
      />
      
      {templates?.map(template => (
        <TemplateCard
          key={template.id}
          template={template}
          onSave={(updates) => handleSave(template.id, updates)}
          onDuplicate={() => handleDuplicate(template.id)}
          onDelete={!template.is_default ? () => handleDelete(template.id) : null}
        />
      ))}
    </div>
  );
}
*/

// ============================================
// EXAMPLE 5: Client Detail / Timeline Page
// ============================================
/*
import { useParams } from 'react-router-dom';
import { 
  useAccountWithEmailHistory,
  useAccountActivity,
  useAccountEnrollments 
} from '../hooks';

function ClientDetailPage() {
  const { accountId } = useParams();
  
  const { data: account } = useAccountWithEmailHistory(accountId);
  const { data: activity } = useAccountActivity(accountId);
  const { data: enrollments } = useAccountEnrollments(accountId);
  
  return (
    <div>
      <ClientHeader account={account} />
      
      <ClientPolicies policies={account?.policies} />
      
      <EmailHistory emails={account?.emailLogs} />
      
      <ActiveEnrollments enrollments={enrollments?.filter(e => e.status === 'Active')} />
      
      <ActivityTimeline activity={activity} />
    </div>
  );
}
*/

// ============================================
// EXAMPLE 6: Settings Page
// ============================================
/*
import { useUserSettings, useUserSettingsMutations } from '../hooks';

function SettingsPage() {
  const { data: settings, isLoading } = useUserSettings();
  const { updateSignature, updateAgencyInfo, updateEmailSettings } = useUserSettingsMutations();
  
  const handleSaveSignature = (signature) => {
    updateSignature.mutate(signature);
  };
  
  const handleSaveAgency = (agencyInfo) => {
    updateAgencyInfo.mutate(agencyInfo);
  };
  
  const handleSaveEmail = (emailSettings) => {
    updateEmailSettings.mutate(emailSettings);
  };
  
  return (
    <div>
      <SignatureForm 
        signature={settings} 
        onSave={handleSaveSignature}
        isSaving={updateSignature.isPending}
      />
      
      <AgencyInfoForm
        agency={settings}
        onSave={handleSaveAgency}
        isSaving={updateAgencyInfo.isPending}
      />
      
      <EmailSettingsForm
        settings={settings}
        onSave={handleSaveEmail}
        isSaving={updateEmailSettings.isPending}
      />
    </div>
  );
}
*/

// ============================================
// EXAMPLE 7: Enrolling an Account
// ============================================
/*
import { useEnrollmentMutations, useCanEnroll } from '../hooks';

function EnrollButton({ automationId, accountId }) {
  const { data: canEnroll } = useCanEnroll(accountId, automationId);
  const { enroll } = useEnrollmentMutations();
  
  const handleEnroll = () => {
    enroll.mutate(
      { automationId, accountId },
      {
        onSuccess: () => toast.success('Enrolled successfully'),
        onError: (err) => toast.error(err.message)
      }
    );
  };
  
  return (
    <button 
      onClick={handleEnroll}
      disabled={!canEnroll || enroll.isPending}
    >
      {enroll.isPending ? 'Enrolling...' : 'Enroll in Automation'}
    </button>
  );
}
*/

// ============================================
// EXAMPLE 8: Checking Email Suppression
// ============================================
/*
import { useEmailSuppression } from '../hooks';

function EmailComposer({ automationId }) {
  const { checkSuppression } = useEmailSuppression();
  const [email, setEmail] = useState('');
  const [isSuppressed, setIsSuppressed] = useState(false);
  
  const handleEmailChange = async (newEmail) => {
    setEmail(newEmail);
    const suppressed = await checkSuppression(newEmail, automationId);
    setIsSuppressed(suppressed);
  };
  
  return (
    <div>
      <input 
        value={email}
        onChange={(e) => handleEmailChange(e.target.value)}
      />
      {isSuppressed && (
        <Warning>This email has unsubscribed and cannot receive emails</Warning>
      )}
    </div>
  );
}
*/

// ============================================
// EXAMPLE 9: Scheduled Emails Management
// ============================================
/*
import { useUpcomingEmails, useScheduledEmailMutations } from '../hooks';

function ScheduledEmailsWidget() {
  const { data: upcoming } = useUpcomingEmails(5);
  const { cancelScheduled, reschedule } = useScheduledEmailMutations();
  
  const handleCancel = (id) => {
    if (confirm('Cancel this scheduled email?')) {
      cancelScheduled.mutate(id);
    }
  };
  
  const handleReschedule = (id, newDate) => {
    reschedule.mutate({ scheduledEmailId: id, newScheduledFor: newDate });
  };
  
  return (
    <div>
      <h3>Upcoming Emails</h3>
      {upcoming?.map(email => (
        <ScheduledEmailCard
          key={email.id}
          email={email}
          onCancel={() => handleCancel(email.id)}
          onReschedule={(date) => handleReschedule(email.id, date)}
        />
      ))}
    </div>
  );
}
*/

export {};
