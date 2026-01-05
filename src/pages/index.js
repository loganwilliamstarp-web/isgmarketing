// Page Components - Connected to Supabase via React Query hooks
// These pages replace the mock data pages with real data fetching

export { default as DashboardPage } from './DashboardPage';
export { default as AutomationsPage } from './AutomationsPage';
export { default as TemplatesPage } from './TemplatesPage';
export { default as ClientsPage } from './ClientsPage';
export { default as ClientProfilePage } from './ClientProfilePage';
export { default as SettingsPage } from './SettingsPage';
export { default as WorkflowBuilderPage } from './WorkflowBuilderPage';
export { default as MassEmailPage } from './MassEmailPage';
export { default as KnowledgeCenterPage } from './KnowledgeCenterPage';

// Re-export for convenience
export * from './DashboardPage';
export * from './AutomationsPage';
export * from './TemplatesPage';
export * from './ClientsPage';
export * from './ClientProfilePage';
export * from './SettingsPage';
export * from './WorkflowBuilderPage';
