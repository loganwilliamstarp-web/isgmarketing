-- ============================================
-- EMAIL AUTOMATION SYSTEM - COMPLETE SCHEMA
-- ============================================
-- Integrates with existing Salesforce sync tables:
--   users, accounts, policies, carriers, producers, import_logs
-- ============================================

-- ============================================
-- TABLE: email_templates
-- ============================================
CREATE TABLE email_templates (
  id SERIAL PRIMARY KEY,
  
  -- Ownership (every template belongs to a user)
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  
  -- Default flag (TRUE = system default, cannot be deleted)
  is_default BOOLEAN DEFAULT FALSE,
  default_key VARCHAR(100),  -- Unique identifier for default templates (e.g., 'welcome_personal')
  
  -- Template Details
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  
  -- Classification
  category VARCHAR(50),  -- Onboarding, Retention, Cross-Sell, Win-Back, Engagement
  
  -- Merge Fields Used
  merge_fields JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_templates_owner ON email_templates(owner_id);
CREATE INDEX idx_email_templates_default ON email_templates(owner_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE UNIQUE INDEX idx_email_templates_default_key ON email_templates(owner_id, default_key) WHERE default_key IS NOT NULL;

-- ============================================
-- TABLE: automations
-- ============================================
CREATE TABLE automations (
  id SERIAL PRIMARY KEY,
  
  -- Ownership (every automation belongs to a user)
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  
  -- Default flag (TRUE = system default, cannot be deleted)
  is_default BOOLEAN DEFAULT FALSE,
  default_key VARCHAR(100),  -- Unique identifier for default automations
  
  -- Basic Info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),  -- Onboarding, Retention, Cross-Sell, Win-Back, Engagement
  
  -- Status (new automations are always inactive/draft until manually activated)
  status VARCHAR(50) DEFAULT 'draft',  -- draft, active, paused, archived
  
  -- Schedule
  send_time TIME DEFAULT '10:00',
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  frequency VARCHAR(50) DEFAULT 'Daily',  -- Daily, Weekly, Monthly
  
  -- Enrollment Rules
  max_enrollments INTEGER DEFAULT 1,  -- How many times an account can enroll (NULL = unlimited)
  enrollment_cooldown_days INTEGER DEFAULT 0,  -- Days before re-enrollment allowed
  distribute_evenly BOOLEAN DEFAULT FALSE,  -- Spread sends over cooldown period
  
  -- Configuration (JSON)
  filter_config JSONB DEFAULT '{}',
  nodes JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  
  -- Aggregate Stats
  stats JSONB DEFAULT '{"sent": 0, "delivered": 0, "opened": 0, "clicked": 0, "bounced": 0}'
);

CREATE INDEX idx_automations_owner ON automations(owner_id);
CREATE INDEX idx_automations_status ON automations(owner_id, status);
CREATE INDEX idx_automations_active ON automations(status) WHERE status = 'active';
CREATE INDEX idx_automations_default ON automations(owner_id, is_default) WHERE is_default = TRUE;
CREATE UNIQUE INDEX idx_automations_default_key ON automations(owner_id, default_key) WHERE default_key IS NOT NULL;

-- ============================================
-- TABLE: automation_enrollments
-- ============================================
CREATE TABLE automation_enrollments (
  id SERIAL PRIMARY KEY,
  
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(account_unique_id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Active',  -- Active, Completed, Exited, Paused
  
  -- Flow Position
  current_node_id VARCHAR(100),
  current_branch VARCHAR(50),
  
  -- Timing
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  last_action_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  
  -- Exit Reason
  exit_reason VARCHAR(255),
  
  -- Stats for this enrollment
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  
  -- Re-enrollment tracking
  enrollment_count INTEGER DEFAULT 1,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrollments_automation ON automation_enrollments(automation_id, status);
CREATE INDEX idx_enrollments_account ON automation_enrollments(account_id);
CREATE INDEX idx_enrollments_next_action ON automation_enrollments(next_action_at) WHERE status = 'Active';
CREATE INDEX idx_enrollments_status ON automation_enrollments(status);

-- Unique constraint for active enrollments only
CREATE UNIQUE INDEX idx_enrollments_unique_active ON automation_enrollments(automation_id, account_id) 
  WHERE status = 'Active';

-- ============================================
-- TABLE: enrollment_history
-- ============================================
CREATE TABLE enrollment_history (
  id SERIAL PRIMARY KEY,
  
  enrollment_id INTEGER NOT NULL REFERENCES automation_enrollments(id) ON DELETE CASCADE,
  
  -- Node Details
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50),
  
  -- Action
  action VARCHAR(50),  -- entered, completed, skipped, failed
  branch_taken VARCHAR(50),
  
  -- Related Records
  email_log_id INTEGER,  -- FK added after email_logs created
  
  -- Result
  result JSONB,
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrollment_history_enrollment ON enrollment_history(enrollment_id);
CREATE INDEX idx_enrollment_history_node ON enrollment_history(node_id);

-- ============================================
-- TABLE: email_logs
-- ============================================
CREATE TABLE email_logs (
  id SERIAL PRIMARY KEY,
  
  -- Ownership & Relationships
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(account_unique_id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  automation_id INTEGER REFERENCES automations(id) ON DELETE SET NULL,
  enrollment_id INTEGER REFERENCES automation_enrollments(id) ON DELETE SET NULL,
  
  -- Email Details
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  reply_to VARCHAR(255),
  subject VARCHAR(500),
  body_html TEXT,
  body_text TEXT,
  
  -- SendGrid Tracking
  sendgrid_message_id VARCHAR(100) UNIQUE,
  sendgrid_batch_id VARCHAR(100),
  
  -- Status
  status VARCHAR(50) DEFAULT 'Queued',  -- Queued, Sent, Delivered, Opened, Clicked, Bounced, Failed, Dropped, Spam
  
  -- Timestamps
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  spam_reported_at TIMESTAMPTZ,
  
  -- Counters
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  
  -- Error Handling
  error_code VARCHAR(50),
  error_message TEXT,
  bounce_type VARCHAR(50),
  bounce_reason TEXT,
  
  -- Recipient Info
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_logs_owner ON email_logs(owner_id);
CREATE INDEX idx_email_logs_account ON email_logs(account_id);
CREATE INDEX idx_email_logs_automation ON email_logs(automation_id);
CREATE INDEX idx_email_logs_enrollment ON email_logs(enrollment_id);
CREATE INDEX idx_email_logs_status ON email_logs(owner_id, status);
CREATE INDEX idx_email_logs_sent_at ON email_logs(owner_id, sent_at DESC);
CREATE INDEX idx_email_logs_sendgrid ON email_logs(sendgrid_message_id);
CREATE INDEX idx_email_logs_to_email ON email_logs(to_email);

-- Add FK to enrollment_history
ALTER TABLE enrollment_history 
  ADD CONSTRAINT fk_enrollment_history_email_log 
  FOREIGN KEY (email_log_id) REFERENCES email_logs(id) ON DELETE SET NULL;

-- ============================================
-- TABLE: email_events
-- ============================================
CREATE TABLE email_events (
  id SERIAL PRIMARY KEY,
  
  email_log_id INTEGER REFERENCES email_logs(id) ON DELETE CASCADE,
  sendgrid_message_id VARCHAR(100),
  
  -- Event Details
  event_type VARCHAR(50) NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Event-Specific Data
  url TEXT,
  reason TEXT,
  bounce_type VARCHAR(50),
  status_code VARCHAR(10),
  
  -- Recipient Info
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- SendGrid Metadata
  sg_event_id VARCHAR(100),
  sg_machine_open BOOLEAN DEFAULT FALSE,
  asm_group_id INTEGER,
  
  -- Raw payload
  raw_payload JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_events_log ON email_events(email_log_id);
CREATE INDEX idx_email_events_sendgrid ON email_events(sendgrid_message_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_timestamp ON email_events(event_timestamp DESC);

-- ============================================
-- TABLE: email_links
-- ============================================
CREATE TABLE email_links (
  id SERIAL PRIMARY KEY,
  
  email_log_id INTEGER NOT NULL REFERENCES email_logs(id) ON DELETE CASCADE,
  
  original_url TEXT NOT NULL,
  tracking_url TEXT,
  link_text TEXT,
  link_position INTEGER,
  
  click_count INTEGER DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_links_log ON email_links(email_log_id);

-- ============================================
-- TABLE: link_clicks
-- ============================================
CREATE TABLE link_clicks (
  id SERIAL PRIMARY KEY,
  
  email_link_id INTEGER NOT NULL REFERENCES email_links(id) ON DELETE CASCADE,
  email_log_id INTEGER NOT NULL REFERENCES email_logs(id) ON DELETE CASCADE,
  email_event_id INTEGER REFERENCES email_events(id) ON DELETE SET NULL,
  
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_type VARCHAR(50),
  browser VARCHAR(50),
  os VARCHAR(50),
  
  -- Geolocation
  country VARCHAR(100),
  region VARCHAR(100),
  city VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_link_clicks_link ON link_clicks(email_link_id);
CREATE INDEX idx_link_clicks_log ON link_clicks(email_log_id);

-- ============================================
-- TABLE: scheduled_emails
-- ============================================
CREATE TABLE scheduled_emails (
  id SERIAL PRIMARY KEY,
  
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(account_unique_id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
  enrollment_id INTEGER REFERENCES automation_enrollments(id) ON DELETE CASCADE,
  
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(255),
  subject VARCHAR(500),
  body_html TEXT,
  body_text TEXT,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  send_window_start TIME,
  send_window_end TIME,
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  
  -- Status
  status VARCHAR(50) DEFAULT 'Pending',  -- Pending, Processing, Sent, Failed, Cancelled
  
  -- Processing
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  
  -- Result
  email_log_id INTEGER REFERENCES email_logs(id),
  error_message TEXT,
  
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_owner ON scheduled_emails(owner_id);
CREATE INDEX idx_scheduled_pending ON scheduled_emails(status, scheduled_for) WHERE status = 'Pending';
CREATE INDEX idx_scheduled_automation ON scheduled_emails(automation_id);

-- ============================================
-- TABLE: activity_log
-- ============================================
CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  
  account_id TEXT REFERENCES accounts(account_unique_id) ON DELETE SET NULL,
  automation_id INTEGER REFERENCES automations(id) ON DELETE SET NULL,
  email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(50),
  
  title VARCHAR(255),
  description TEXT,
  
  actor_type VARCHAR(50),
  actor_id VARCHAR(100),
  actor_name VARCHAR(255),
  
  event_data JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_owner ON activity_log(owner_id, created_at DESC);
CREATE INDEX idx_activity_account ON activity_log(account_id);
CREATE INDEX idx_activity_type ON activity_log(event_type);

-- ============================================
-- TABLE: unsubscribes
-- ============================================
CREATE TABLE unsubscribes (
  id SERIAL PRIMARY KEY,
  
  email VARCHAR(255) NOT NULL,
  account_id TEXT REFERENCES accounts(account_unique_id) ON DELETE SET NULL,
  
  -- Unsubscribe scope
  unsubscribe_type VARCHAR(50) NOT NULL DEFAULT 'all',  -- 'all' or 'automation'
  automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,  -- NULL if type='all'
  
  -- Source
  source VARCHAR(50),  -- link_click, sendgrid_webhook, manual, spam_report
  email_log_id INTEGER REFERENCES email_logs(id) ON DELETE SET NULL,
  
  is_active BOOLEAN DEFAULT TRUE,
  resubscribed_at TIMESTAMPTZ,
  
  ip_address VARCHAR(45),
  user_agent TEXT,
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_unsubscribes_email ON unsubscribes(email);
CREATE INDEX idx_unsubscribes_active ON unsubscribes(email, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_unsubscribes_account ON unsubscribes(account_id);
CREATE INDEX idx_unsubscribes_automation ON unsubscribes(automation_id);

-- Unique constraint per email + type + automation combo
CREATE UNIQUE INDEX idx_unsubscribes_unique ON unsubscribes(email, unsubscribe_type, COALESCE(automation_id, 0)) 
  WHERE is_active = TRUE;

-- ============================================
-- TABLE: email_stats_daily
-- ============================================
CREATE TABLE email_stats_daily (
  id SERIAL PRIMARY KEY,
  
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
  
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  unique_opens INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  hard_bounces INTEGER DEFAULT 0,
  soft_bounces INTEGER DEFAULT 0,
  spam_reports INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  
  open_rate DECIMAL(5, 2),
  click_rate DECIMAL(5, 2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_stats_owner_date ON email_stats_daily(owner_id, stat_date DESC);
CREATE INDEX idx_email_stats_automation ON email_stats_daily(automation_id);
CREATE UNIQUE INDEX idx_email_stats_unique ON email_stats_daily(owner_id, stat_date, COALESCE(automation_id, 0));

-- ============================================
-- TABLE: sendgrid_webhooks
-- ============================================
CREATE TABLE sendgrid_webhooks (
  id SERIAL PRIMARY KEY,
  
  event_type VARCHAR(50),
  sendgrid_message_id VARCHAR(100),
  sg_event_id VARCHAR(100),
  
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  
  payload JSONB NOT NULL,
  headers JSONB,
  ip_address VARCHAR(45),
  
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sendgrid_webhooks_unprocessed ON sendgrid_webhooks(processed) WHERE processed = FALSE;
CREATE INDEX idx_sendgrid_webhooks_message ON sendgrid_webhooks(sendgrid_message_id);

-- ============================================
-- TABLE: user_settings
-- ============================================
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(user_unique_id) ON DELETE CASCADE,
  
  -- Email Signature
  signature_name VARCHAR(255),
  signature_title VARCHAR(100),
  signature_phone VARCHAR(50),
  signature_email VARCHAR(255),
  signature_message TEXT,  -- Optional tagline
  
  -- Agency Info (for unsubscribe footer)
  agency_name VARCHAR(255),
  agency_address TEXT,
  agency_phone VARCHAR(50),
  agency_website VARCHAR(255),
  
  -- Default Send Settings
  default_send_time TIME DEFAULT '10:00',
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  daily_send_limit INTEGER DEFAULT 500,
  
  -- SendGrid Settings
  from_name VARCHAR(255),
  from_email VARCHAR(255),
  reply_to_email VARCHAR(255),
  
  -- Preferences
  preferences JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: mass_email_batches
-- ============================================
CREATE TABLE mass_email_batches (
  id SERIAL PRIMARY KEY,
  
  owner_id TEXT NOT NULL REFERENCES users(user_unique_id) ON DELETE CASCADE,
  
  name VARCHAR(255),
  subject VARCHAR(500),
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  
  filter_config JSONB,
  
  status VARCHAR(50) DEFAULT 'Draft',  -- Draft, Scheduled, Sending, Completed, Cancelled
  
  total_recipients INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_failed INTEGER DEFAULT 0,
  
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  stats JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mass_email_owner ON mass_email_batches(owner_id);
CREATE INDEX idx_mass_email_status ON mass_email_batches(status);


-- ============================================
-- TABLE: admin_users
-- ============================================
-- Users who can edit master automations/templates
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,  -- Can be user_unique_id or any identifier
  name VARCHAR(255),  -- Optional display name for reference
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial admin user
INSERT INTO admin_users (user_id, name) VALUES ('0056g000004jvyVAAQ', 'Master Admin');


-- ============================================
-- TABLE: master_automations
-- ============================================
-- Canonical default automations that sync to all users
CREATE TABLE master_automations (
  id SERIAL PRIMARY KEY,

  -- Unique key to match with user copies (e.g., 'midterm_cross_personal')
  default_key VARCHAR(100) NOT NULL UNIQUE,

  -- Basic Info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),

  -- Schedule defaults
  send_time TIME DEFAULT '10:00',
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  frequency VARCHAR(50) DEFAULT 'Daily',

  -- Enrollment Rules
  max_enrollments INTEGER DEFAULT 1,
  enrollment_cooldown_days INTEGER DEFAULT 0,
  distribute_evenly BOOLEAN DEFAULT FALSE,

  -- Configuration (JSON)
  filter_config JSONB DEFAULT '{}',
  nodes JSONB DEFAULT '[]',

  -- Version tracking for sync
  version INTEGER DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_master_automations_key ON master_automations(default_key);


-- ============================================
-- TABLE: master_templates
-- ============================================
-- Canonical default email templates that sync to all users
CREATE TABLE master_templates (
  id SERIAL PRIMARY KEY,

  -- Unique key to match with user copies
  default_key VARCHAR(100) NOT NULL UNIQUE,

  -- Template Details
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,

  -- Classification
  category VARCHAR(50),

  -- Merge Fields Used
  merge_fields JSONB DEFAULT '[]',

  -- Version tracking for sync
  version INTEGER DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_master_templates_key ON master_templates(default_key);


-- ============================================
-- TRIGGERS: Auto-update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER automations_updated_at BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER automation_enrollments_updated_at BEFORE UPDATE ON automation_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER email_logs_updated_at BEFORE UPDATE ON email_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER scheduled_emails_updated_at BEFORE UPDATE ON scheduled_emails FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER unsubscribes_updated_at BEFORE UPDATE ON unsubscribes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER email_stats_daily_updated_at BEFORE UPDATE ON email_stats_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER mass_email_batches_updated_at BEFORE UPDATE ON mass_email_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER master_automations_updated_at BEFORE UPDATE ON master_automations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER master_templates_updated_at BEFORE UPDATE ON master_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================
-- FUNCTION: Check if user is admin
-- ============================================
CREATE OR REPLACE FUNCTION is_admin_user(p_user_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- FUNCTION: Sync master automation to all users
-- ============================================
-- Called when a master automation is updated
-- Syncs all fields EXCEPT status (user controlled)
CREATE OR REPLACE FUNCTION sync_master_automation_to_users(p_default_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_master master_automations%ROWTYPE;
  v_updated_count INTEGER;
BEGIN
  -- Get the master automation
  SELECT * INTO v_master FROM master_automations WHERE default_key = p_default_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master automation with key % not found', p_default_key;
  END IF;

  -- Update all user copies (keep their status intact)
  UPDATE automations
  SET
    name = v_master.name,
    description = v_master.description,
    category = v_master.category,
    send_time = v_master.send_time,
    timezone = v_master.timezone,
    frequency = v_master.frequency,
    max_enrollments = v_master.max_enrollments,
    enrollment_cooldown_days = v_master.enrollment_cooldown_days,
    distribute_evenly = v_master.distribute_evenly,
    filter_config = v_master.filter_config,
    nodes = v_master.nodes,
    updated_at = NOW()
  WHERE default_key = p_default_key
    AND is_default = TRUE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- FUNCTION: Sync master template to all users
-- ============================================
CREATE OR REPLACE FUNCTION sync_master_template_to_users(p_default_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_master master_templates%ROWTYPE;
  v_updated_count INTEGER;
BEGIN
  -- Get the master template
  SELECT * INTO v_master FROM master_templates WHERE default_key = p_default_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master template with key % not found', p_default_key;
  END IF;

  -- Update all user copies
  UPDATE email_templates
  SET
    name = v_master.name,
    subject = v_master.subject,
    body_html = v_master.body_html,
    body_text = v_master.body_text,
    category = v_master.category,
    merge_fields = v_master.merge_fields,
    updated_at = NOW()
  WHERE default_key = p_default_key
    AND is_default = TRUE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- FUNCTION: Sync ALL master automations to all users
-- ============================================
CREATE OR REPLACE FUNCTION sync_all_master_automations()
RETURNS TABLE(default_key TEXT, users_updated INTEGER) AS $$
DECLARE
  v_master RECORD;
BEGIN
  FOR v_master IN SELECT ma.default_key FROM master_automations ma
  LOOP
    default_key := v_master.default_key;
    users_updated := sync_master_automation_to_users(v_master.default_key);
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- FUNCTION: Sync ALL master templates to all users
-- ============================================
CREATE OR REPLACE FUNCTION sync_all_master_templates()
RETURNS TABLE(default_key TEXT, users_updated INTEGER) AS $$
DECLARE
  v_master RECORD;
BEGIN
  FOR v_master IN SELECT mt.default_key FROM master_templates mt
  LOOP
    default_key := v_master.default_key;
    users_updated := sync_master_template_to_users(v_master.default_key);
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- TRIGGER: Auto-sync when master automation is updated
-- ============================================
CREATE OR REPLACE FUNCTION on_master_automation_updated()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment version
  NEW.version := OLD.version + 1;

  -- Sync to all users (after the update completes)
  PERFORM sync_master_automation_to_users(NEW.default_key);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER master_automation_sync_trigger
  AFTER UPDATE ON master_automations
  FOR EACH ROW
  EXECUTE FUNCTION on_master_automation_updated();


-- ============================================
-- TRIGGER: Auto-sync when master template is updated
-- ============================================
CREATE OR REPLACE FUNCTION on_master_template_updated()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment version
  NEW.version := OLD.version + 1;

  -- Sync to all users (after the update completes)
  PERFORM sync_master_template_to_users(NEW.default_key);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER master_template_sync_trigger
  AFTER UPDATE ON master_templates
  FOR EACH ROW
  EXECUTE FUNCTION on_master_template_updated();


-- ============================================
-- TRIGGER: Update email_logs from events
-- ============================================
CREATE OR REPLACE FUNCTION update_email_log_from_event()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE email_logs SET
    status = CASE 
      WHEN NEW.event_type = 'delivered' AND status NOT IN ('Opened', 'Clicked') THEN 'Delivered'
      WHEN NEW.event_type = 'open' THEN 'Opened'
      WHEN NEW.event_type = 'click' THEN 'Clicked'
      WHEN NEW.event_type = 'bounce' THEN 'Bounced'
      WHEN NEW.event_type = 'dropped' THEN 'Dropped'
      WHEN NEW.event_type = 'spam_report' THEN 'Spam'
      ELSE status
    END,
    delivered_at = CASE WHEN NEW.event_type = 'delivered' AND delivered_at IS NULL THEN NEW.event_timestamp ELSE delivered_at END,
    first_opened_at = CASE WHEN NEW.event_type = 'open' AND first_opened_at IS NULL THEN NEW.event_timestamp ELSE first_opened_at END,
    last_opened_at = CASE WHEN NEW.event_type = 'open' THEN NEW.event_timestamp ELSE last_opened_at END,
    first_clicked_at = CASE WHEN NEW.event_type = 'click' AND first_clicked_at IS NULL THEN NEW.event_timestamp ELSE first_clicked_at END,
    last_clicked_at = CASE WHEN NEW.event_type = 'click' THEN NEW.event_timestamp ELSE last_clicked_at END,
    bounced_at = CASE WHEN NEW.event_type = 'bounce' THEN NEW.event_timestamp ELSE bounced_at END,
    spam_reported_at = CASE WHEN NEW.event_type = 'spam_report' THEN NEW.event_timestamp ELSE spam_reported_at END,
    unsubscribed_at = CASE WHEN NEW.event_type IN ('unsubscribe', 'group_unsubscribe') THEN NEW.event_timestamp ELSE unsubscribed_at END,
    open_count = CASE WHEN NEW.event_type = 'open' THEN open_count + 1 ELSE open_count END,
    click_count = CASE WHEN NEW.event_type = 'click' THEN click_count + 1 ELSE click_count END,
    bounce_type = CASE WHEN NEW.event_type = 'bounce' THEN NEW.bounce_type ELSE bounce_type END,
    bounce_reason = CASE WHEN NEW.event_type = 'bounce' THEN NEW.reason ELSE bounce_reason END,
    ip_address = COALESCE(NEW.ip_address, ip_address),
    user_agent = COALESCE(NEW.user_agent, user_agent)
  WHERE id = NEW.email_log_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_event_update_log
  AFTER INSERT ON email_events
  FOR EACH ROW WHEN (NEW.email_log_id IS NOT NULL)
  EXECUTE FUNCTION update_email_log_from_event();


-- ============================================
-- TRIGGER: Prevent deletion of default templates
-- ============================================
CREATE OR REPLACE FUNCTION prevent_default_template_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_default = TRUE THEN
    RAISE EXCEPTION 'Cannot delete default email template. You can only edit it.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_template_delete
  BEFORE DELETE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION prevent_default_template_delete();


-- ============================================
-- TRIGGER: Prevent deletion of default automations
-- ============================================
CREATE OR REPLACE FUNCTION prevent_default_automation_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_default = TRUE THEN
    RAISE EXCEPTION 'Cannot delete default automation. You can only edit it.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_automation_delete
  BEFORE DELETE ON automations
  FOR EACH ROW EXECUTE FUNCTION prevent_default_automation_delete();


-- ============================================
-- FUNCTION: Create default templates for a user
-- ============================================
CREATE OR REPLACE FUNCTION create_default_templates_for_user(p_user_id TEXT)
RETURNS void AS $$
BEGIN
  -- Template 1: Welcome Email - Personal Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'welcome_personal', 
    'Welcome Email - Personal Lines',
    'Thank you for choosing us!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Welcome to the family! We''re thrilled to have you as a customer and honored that you''ve trusted us with your insurance needs.</p>

<p>As your dedicated insurance advisor, I''m here to make sure you always have the right coverage at the best value. Here''s what you can expect from us:</p>

<ul>
  <li><strong>Personalized Service</strong> – You''re not just a policy number. I''m always just a call or email away.</li>
  <li><strong>Annual Reviews</strong> – We''ll check in regularly to make sure your coverage still fits your life.</li>
  <li><strong>Claims Support</strong> – If something happens, we''ll guide you through every step.</li>
</ul>

<p>Have questions about your policy or want to explore additional coverage options? Don''t hesitate to reach out!</p>

<p>Thanks again for choosing us. We look forward to serving you for years to come.</p>',
    'Onboarding',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 2: Welcome Email - Commercial Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'welcome_commercial',
    'Welcome Email - Commercial Lines',
    'Thank you for choosing us for your business!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Welcome aboard! On behalf of everyone at our agency, thank you for trusting us with your business insurance needs.</p>

<p>We understand that protecting your business is about more than just having a policy – it''s about having a partner who understands your unique risks and is there when you need them most.</p>

<p>Here''s what we bring to the table:</p>

<ul>
  <li><strong>Industry Expertise</strong> – We specialize in finding the right coverage for businesses like yours.</li>
  <li><strong>Proactive Risk Management</strong> – We''ll help you identify and mitigate risks before they become claims.</li>
  <li><strong>Dedicated Support</strong> – Your business doesn''t stop at 5pm, and neither do we when you need us.</li>
  <li><strong>Certificate Management</strong> – Need a COI? We''ve got you covered quickly.</li>
</ul>

<p>I''d love to schedule a quick call to make sure we''ve covered all your bases. Feel free to reach out anytime.</p>

<p>Here''s to a successful partnership!</p>',
    'Onboarding',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 3: Renewal Email - Personal Lines (No Cross Sale)
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'renewal_personal_no_cross',
    'Renewal Email - Personal Lines - No Cross Sale',
    'Get Ready for Your Policy Renewal, {{ account.primary_contact_first_name }}',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Your policy renewal is coming up in about 45 days, and I wanted to reach out personally to make sure everything is in order.</p>

<p><strong>Here''s what happens next:</strong></p>

<ol>
  <li>We''re reviewing your current coverage to ensure it still meets your needs</li>
  <li>We''re shopping rates across our carrier partners to find you the best value</li>
  <li>You''ll receive your renewal documents soon with all the details</li>
</ol>

<p><strong>Has anything changed?</strong></p>

<p>Life changes, and so should your coverage. Please let us know if you''ve experienced any of the following:</p>

<ul>
  <li>New drivers in the household</li>
  <li>Recent home improvements or renovations</li>
  <li>New vehicles or major purchases</li>
  <li>Changes to your property (pool, trampoline, etc.)</li>
</ul>

<p>Even if nothing has changed, I''d love to do a quick review to make sure you''re getting every discount you deserve.</p>

<p>Reply to this email or give me a call – I''m here to help!</p>',
    'Retention',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 4: Renewal Email - Personal Lines (Cross Sale)
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'renewal_personal_cross',
    'Renewal Email - Personal Lines - Cross Sale',
    'Get Ready for Your Policy Renewal, {{ account.primary_contact_first_name }}',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Your policy renewal is coming up in about 45 days, and I wanted to reach out personally to make sure everything is in order.</p>

<p><strong>Here''s what happens next:</strong></p>

<ol>
  <li>We''re reviewing your current coverage to ensure it still meets your needs</li>
  <li>We''re shopping rates across our carrier partners to find you the best value</li>
  <li>You''ll receive your renewal documents soon with all the details</li>
</ol>

<p><strong>💡 Did you know you could save by bundling?</strong></p>

<p>Many of our customers save <strong>up to 20%</strong> when they bundle their auto and home (or renters) insurance together. Since you currently have coverage with us for one but not the other, I''d love to run a quick quote to see how much you could save.</p>

<p>It only takes a few minutes, and there''s no obligation – just potential savings!</p>

<p><strong>Has anything changed?</strong></p>

<p>Please also let me know if you''ve had any life changes that might affect your coverage needs – new drivers, home improvements, or major purchases.</p>

<p>Reply to this email or give me a call. I''m here to help you save!</p>',
    'Retention',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 5: Renewal Email - Commercial Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'renewal_commercial',
    'Renewal Email - Commercial Lines',
    'Get Ready for Your Policy Renewal, {{ account.primary_contact_first_name }}',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Your commercial policy renewal is approaching in about 30 days, and I wanted to connect to ensure a smooth renewal process.</p>

<p><strong>Our renewal process includes:</strong></p>

<ul>
  <li>A thorough review of your current coverage and limits</li>
  <li>Analysis of any changes to your business operations or exposures</li>
  <li>Competitive quotes from our carrier partners</li>
  <li>Recommendations for any coverage gaps we identify</li>
</ul>

<p><strong>Please review and let me know:</strong></p>

<ul>
  <li>Have your revenues or payroll changed significantly?</li>
  <li>Any new locations, vehicles, or equipment?</li>
  <li>Changes to your operations or services offered?</li>
  <li>Any claims or incidents we should discuss?</li>
</ul>

<p>The more information you can provide, the better positioned we are to negotiate the best terms on your behalf.</p>

<p>Let''s schedule a quick 15-minute renewal review call. Reply to this email or call me directly.</p>',
    'Retention',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 6: Policy Renewed - Personal Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'renewed_personal',
    'Policy Renewed - Personal Lines',
    'Your policy has renewed!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Great news – your policy has successfully renewed! 🎉</p>

<p>Your coverage is active and you''re all set for another term. Your new policy documents should arrive in your mailbox soon (or check your carrier''s online portal for instant access).</p>

<p><strong>A few quick reminders:</strong></p>

<ul>
  <li><strong>ID Cards</strong> – New auto ID cards will be included with your documents. Keep them in your vehicle!</li>
  <li><strong>Payment</strong> – If you''re on autopay, your new premium will be drafted according to your payment schedule. If you pay manually, watch for your invoice.</li>
  <li><strong>Review Your Declarations</strong> – Take a quick look at your dec page to confirm all details are correct.</li>
</ul>

<p><strong>Questions about your renewal?</strong></p>

<p>I''m always happy to walk through your coverage, explain any changes, or discuss ways to save on your next renewal.</p>

<p>Thank you for continuing to trust us with your insurance needs!</p>',
    'Retention',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 7: Policy Renewed - Commercial Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'renewed_commercial',
    'Policy Renewed - Commercial Lines',
    'Your policy has renewed!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Your commercial policy has successfully renewed and your coverage is now active for the new term.</p>

<p><strong>What to expect:</strong></p>

<ul>
  <li>Your updated policy documents will arrive shortly</li>
  <li>New Certificates of Insurance can be requested anytime</li>
  <li>Your payment schedule remains unchanged unless we discussed modifications</li>
</ul>

<p><strong>Important reminders:</strong></p>

<ul>
  <li>Review your declarations page to verify all business details are accurate</li>
  <li>Update your certificate holders if any vendor or client requirements have changed</li>
  <li>Keep us informed of any mid-term changes to your operations</li>
</ul>

<p><strong>Need certificates or have questions?</strong></p>

<p>Just reply to this email with your request and we''ll have them to you within 24 hours. For urgent certificate needs, give us a call.</p>

<p>Thank you for your continued business. We''re proud to be your insurance partner!</p>',
    'Retention',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 8: Midterm Cross Sale - Personal Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'midterm_cross_personal',
    'Midterm Cross Sale - Personal Lines',
    'Potential Savings on Your Insurance',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>I was reviewing your account and noticed an opportunity that could save you money – I wanted to share it with you!</p>

<p><strong>Here''s the situation:</strong></p>

<p>You currently have your auto (or home) insurance with us, but not both. By bundling these policies together, most of our customers save <strong>15-25% on their total premium</strong>.</p>

<p><strong>Why bundle?</strong></p>

<ul>
  <li>💰 <strong>Multi-policy discounts</strong> – Immediate savings just for having both policies with us</li>
  <li>📋 <strong>One agent, one bill</strong> – Simplify your life with consolidated coverage</li>
  <li>🛡️ <strong>Better protection</strong> – We can identify coverage gaps when we see the full picture</li>
  <li>⏰ <strong>Easier claims</strong> – One point of contact if something happens</li>
</ul>

<p><strong>No obligation, just information:</strong></p>

<p>I''m happy to run a quick quote so you can see exactly what you''d save. It only takes about 5 minutes of your time, and there''s absolutely no pressure.</p>

<p>Interested? Just reply "yes" and I''ll reach out to gather a few details. Or give me a call whenever it''s convenient!</p>',
    'Cross-Sell',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 9: Prospect Email - All Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'prospect_all',
    'Prospect Email - All Lines',
    'Hi {{ account.primary_contact_first_name }}, Let''s Revisit Your Insurance Needs!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>I hope this message finds you well! I wanted to check in and see if now might be a good time to revisit your insurance needs.</p>

<p>Insurance rates change frequently – sometimes significantly – and what wasn''t competitive a few months ago might be a great deal today. Many people are surprised to find they can get <strong>better coverage at a lower price</strong> just by shopping around.</p>

<p><strong>Here''s what I can offer:</strong></p>

<ul>
  <li>✅ A no-obligation quote comparison in just minutes</li>
  <li>✅ Access to multiple top-rated insurance carriers</li>
  <li>✅ Personalized recommendations based on your specific situation</li>
  <li>✅ Local, dedicated service – I''m your neighbor, not a call center</li>
</ul>

<p><strong>Common reasons people reach back out:</strong></p>

<ul>
  <li>Recent rate increases from their current carrier</li>
  <li>Bought a new home or vehicle</li>
  <li>Got married or had life changes</li>
  <li>Simply haven''t shopped in a while</li>
</ul>

<p>Would you be open to a quick conversation? No pressure – I just want to make sure you''re getting the best value for your insurance dollar.</p>

<p>Reply to this email or give me a call anytime!</p>',
    'Win-Back',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 10: Prior Customer Email - All Lines
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'prior_customer_all',
    'Prior Customer Email - All Lines',
    'Hi {{ account.primary_contact_first_name }}, Let''s Reconnect on Insurance!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>It''s been a while since we last worked together, and I wanted to reach out personally.</p>

<p>I don''t know what led you to make a change, but I want you to know our door is always open. The insurance market has shifted a lot recently, and I''d love the opportunity to show you what we can offer today.</p>

<p><strong>What''s new with us:</strong></p>

<ul>
  <li>New carrier partnerships with competitive rates</li>
  <li>Enhanced coverage options and discounts</li>
  <li>Improved service tools and faster response times</li>
  <li>Same local, personal service you experienced before</li>
</ul>

<p><strong>Why come back?</strong></p>

<p>You already know how we work – no pushy sales tactics, just honest advice and competitive options. If rates have gone up with your current carrier (and they probably have), it costs nothing to let us show you what''s available.</p>

<p>I''d genuinely love to earn your business back. Would you be open to a quick quote comparison?</p>

<p>Just reply to this email or give me a call. Either way, I wish you all the best!</p>',
    'Win-Back',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 11: Periodic Review Touch
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'periodic_review',
    'Periodic Review Touch',
    'Hi {{ account.primary_contact_first_name }}, Time for Your Annual Insurance Checkup!',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>Just like an annual physical keeps you healthy, an annual insurance review keeps you protected!</p>

<p>It''s been a while since we''ve done a comprehensive review of your coverage, and I''d love to schedule a quick checkup to make sure everything is still aligned with your needs.</p>

<p><strong>In our review, we''ll cover:</strong></p>

<ul>
  <li>🏠 <strong>Coverage adequacy</strong> – Are your limits still appropriate for today''s replacement costs?</li>
  <li>💰 <strong>Discount opportunities</strong> – Are you getting every discount you qualify for?</li>
  <li>🔍 <strong>Gap analysis</strong> – Are there any exposures we should address?</li>
  <li>📊 <strong>Rate comparison</strong> – How do your current rates compare to the market?</li>
</ul>

<p><strong>This typically takes just 15-20 minutes</strong> and can be done over the phone at your convenience.</p>

<p>No changes required – this is simply about making sure you''re properly protected and getting the best value.</p>

<p>Would you have a few minutes this week or next? Reply with a couple times that work for you, or give me a call!</p>',
    'Engagement',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

  -- Template 12: Renewal Reminder (Follow-up)
  INSERT INTO email_templates (owner_id, is_default, default_key, name, subject, body_html, category, merge_fields)
  VALUES (p_user_id, TRUE, 'renewal_reminder',
    'Renewal Reminder',
    'Following up on your upcoming renewal, {{ account.primary_contact_first_name }}',
    '<p>Hi {{ account.primary_contact_first_name }},</p>

<p>I sent an email recently about your upcoming policy renewal and wanted to make sure it didn''t get lost in your inbox!</p>

<p><strong>Quick recap:</strong> Your policy is renewing soon and I want to make sure we''ve covered everything before your renewal date.</p>

<p><strong>Can you take 2 minutes to:</strong></p>

<ol>
  <li>Let me know if anything has changed (new car, home updates, etc.)</li>
  <li>Confirm your contact information is up to date</li>
  <li>Ask any questions about your coverage</li>
</ol>

<p>If everything looks good and you don''t need anything, no action is required – your policy will renew automatically.</p>

<p>But if you''d like to review your options or explore ways to save, I''m just a reply away!</p>

<p><em>P.S. – Even a quick "all good!" reply helps me know you''re set. 😊</em></p>',
    'Retention',
    '["{{ account.primary_contact_first_name }}"]'::jsonb
  );

END;
$$ LANGUAGE plpgsql;


-- ============================================
-- FUNCTION: Create default automations for a user
-- ============================================
CREATE OR REPLACE FUNCTION create_default_automations_for_user(p_user_id TEXT)
RETURNS void AS $$
DECLARE
  v_template_id INTEGER;
BEGIN

  -- Automation 1: Welcome Email - Personal Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'welcome_personal',
    'Welcome Email - Personal Lines',
    'Send welcome email to new personal lines customers 15 days after becoming a customer',
    'Onboarding', 'Active', '10:00', 'America/Chicago', 'Daily',
    1, 0,  -- Can only enroll 1 time
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_type", "operator": "equals", "value": "Personal"},
          {"field": "customer_since", "operator": "equals_days_ago", "value": 15}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "New Personal Customer (15 days)"},
      {"id": "node-1", "type": "send_email", "title": "Send Welcome Email", "config": {"templateKey": "welcome_personal"}}
    ]'::jsonb
  );

  -- Automation 2: Welcome Email - Commercial Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'welcome_commercial',
    'Welcome Email - Commercial Lines',
    'Send welcome email to new commercial customers 7 days after becoming a customer',
    'Onboarding', 'Active', '10:00', 'America/Chicago', 'Daily',
    1, 0,  -- Can only enroll 1 time
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_type", "operator": "equals", "value": "Commercial"},
          {"field": "customer_since", "operator": "equals_days_ago", "value": 7}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "New Commercial Customer (7 days)"},
      {"id": "node-1", "type": "send_email", "title": "Send Welcome Email", "config": {"templateKey": "welcome_commercial"}}
    ]'::jsonb
  );

  -- Automation 3: Renewal Email - Personal Lines - No Cross Sale
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewal_personal_no_cross',
    'Renewal Email - Personal Lines - No Cross Sale',
    'Renewal reminder for personal lines customers who have both auto AND home/renters (no cross-sell opportunity)',
    'Retention', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,  -- Re-enroll after 90 days
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_expiration_date", "operator": "equals_days_from_now", "value": 45},
          {"field": "policy_class", "operator": "equals", "value": "Personal"},
          {"field": "has_policy_type", "operator": "equals", "value": "Personal Auto"},
          {"field": "has_policy_type", "operator": "in", "value": ["Homeowners", "Renters"]}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Policy Expiring in 45 Days"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Email", "config": {"templateKey": "renewal_personal_no_cross"}},
      {"id": "node-2", "type": "delay", "title": "Wait 15 days", "config": {"days": 15}},
      {"id": "node-3", "type": "condition", "title": "Email Opened?", "config": {"type": "email_opened", "emailNodeId": "node-1"}, "branches": {
        "yes": [],
        "no": [{"id": "node-4", "type": "send_email", "title": "Send Reminder", "config": {"templateKey": "renewal_reminder"}}]
      }}
    ]'::jsonb
  );

  -- Automation 4: Renewal Email - Personal Lines - Cross Sale
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewal_personal_cross',
    'Renewal Email - Personal Lines - Cross Sale',
    'Renewal reminder for personal lines customers who have only ONE of auto/home/renters (cross-sell opportunity)',
    'Retention', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_expiration_date", "operator": "equals_days_from_now", "value": 45},
          {"field": "policy_class", "operator": "equals", "value": "Personal"},
          {"field": "has_only_one_of", "operator": "in", "value": ["Personal Auto", "Homeowners", "Renters"]}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Policy Expiring in 45 Days (Cross-Sell)"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal + Cross-Sell Email", "config": {"templateKey": "renewal_personal_cross"}},
      {"id": "node-2", "type": "delay", "title": "Wait 15 days", "config": {"days": 15}},
      {"id": "node-3", "type": "condition", "title": "Email Opened?", "config": {"type": "email_opened", "emailNodeId": "node-1"}, "branches": {
        "yes": [],
        "no": [{"id": "node-4", "type": "send_email", "title": "Send Reminder", "config": {"templateKey": "renewal_reminder"}}]
      }}
    ]'::jsonb
  );

  -- Automation 5: Renewal Email - Commercial Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewal_commercial',
    'Renewal Email - Commercial Lines',
    'Renewal reminder for commercial lines customers 30 days before expiration',
    'Retention', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_expiration_date", "operator": "equals_days_from_now", "value": 30},
          {"field": "policy_class", "operator": "equals", "value": "Commercial"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Commercial Policy Expiring in 30 Days"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Email", "config": {"templateKey": "renewal_commercial"}},
      {"id": "node-2", "type": "delay", "title": "Wait 10 days", "config": {"days": 10}},
      {"id": "node-3", "type": "condition", "title": "Email Opened?", "config": {"type": "email_opened", "emailNodeId": "node-1"}, "branches": {
        "yes": [],
        "no": [{"id": "node-4", "type": "send_email", "title": "Send Reminder", "config": {"templateKey": "renewal_reminder"}}]
      }}
    ]'::jsonb
  );

  -- Automation 6: Policy Renewed - Personal Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewed_personal',
    'Policy Renewed - Personal Lines',
    'Send confirmation email when personal lines policy renews',
    'Retention', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_term", "operator": "equals", "value": "Renewal"},
          {"field": "policy_effective_date", "operator": "equals_days_ago", "value": 3},
          {"field": "policy_class", "operator": "equals", "value": "Personal"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Personal Policy Renewed (3 days ago)"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Confirmation", "config": {"templateKey": "renewed_personal"}}
    ]'::jsonb
  );

  -- Automation 7: Policy Renewed - Commercial Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'renewed_commercial',
    'Policy Renewed - Commercial Lines',
    'Send confirmation email when commercial policy renews',
    'Retention', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 90,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "policy_status", "operator": "equals", "value": "Active"},
          {"field": "policy_term", "operator": "equals", "value": "Renewal"},
          {"field": "policy_effective_date", "operator": "equals_days_ago", "value": 3},
          {"field": "policy_class", "operator": "equals", "value": "Commercial"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Commercial Policy Renewed (3 days ago)"},
      {"id": "node-1", "type": "send_email", "title": "Send Renewal Confirmation", "config": {"templateKey": "renewed_commercial"}}
    ]'::jsonb
  );

  -- Automation 8: Midterm Cross Sale - Personal Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'midterm_cross_personal',
    'Midterm Cross Sale - Personal Lines',
    'Cross-sell opportunity for customers with only one policy type, triggered mid-term',
    'Cross-Sell', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 45,
    '{
      "groups": [
        {
          "rules": [
            {"field": "active_policy_type", "operator": "is", "value": "Home"},
            {"field": "active_policy_type", "operator": "is_not", "value": "Auto"},
            {"field": "policy_term", "operator": "is", "value": "12"},
            {"field": "policy_expiration", "operator": "more_than_days_future", "value": "170"},
            {"field": "policy_expiration", "operator": "less_than_days_future", "value": "190"}
          ]
        },
        {
          "rules": [
            {"field": "active_policy_type", "operator": "is", "value": "Auto"},
            {"field": "active_policy_type", "operator": "is_not_any", "value": "Home,Renters"},
            {"field": "policy_term", "operator": "is", "value": "12"},
            {"field": "policy_expiration", "operator": "more_than_days_future", "value": "170"},
            {"field": "policy_expiration", "operator": "less_than_days_future", "value": "180"}
          ]
        },
        {
          "rules": [
            {"field": "active_policy_type", "operator": "is", "value": "Auto"},
            {"field": "active_policy_type", "operator": "is_not_any", "value": "Home,Renters"},
            {"field": "policy_term", "operator": "is", "value": "6"},
            {"field": "policy_expiration", "operator": "more_than_days_future", "value": "80"},
            {"field": "policy_expiration", "operator": "less_than_days_future", "value": "90"}
          ]
        }
      ]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Mid-Term Cross-Sell Opportunity"},
      {"id": "node-1", "type": "send_email", "title": "Send Cross-Sell Email", "config": {"templateKey": "midterm_cross_personal"}}
    ]'::jsonb
  );

  -- Automation 9: Prospect Email - All Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'prospect_all',
    'Prospect Email - All Lines',
    'Re-engage prospects who never became customers',
    'Win-Back', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 365, TRUE,  -- Re-enroll every 365 days, distribute evenly
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_status", "operator": "equals", "value": "prospect"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Prospect Account"},
      {"id": "node-1", "type": "send_email", "title": "Send Prospect Email", "config": {"templateKey": "prospect_all"}}
    ]'::jsonb
  );

  -- Automation 10: Prior Customer Email - All Lines
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'prior_customer_all',
    'Prior Customer Email - All Lines',
    'Win-back campaign for prior customers',
    'Win-Back', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 365, TRUE,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "account_status", "operator": "equals", "value": "prior_customer"}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "Prior Customer Account"},
      {"id": "node-1", "type": "send_email", "title": "Send Win-Back Email", "config": {"templateKey": "prior_customer_all"}}
    ]'::jsonb
  );

  -- Automation 11: Periodic Review Touch
  INSERT INTO automations (owner_id, is_default, default_key, name, description, category, status, send_time, timezone, frequency, max_enrollments, enrollment_cooldown_days, distribute_evenly, filter_config, nodes)
  VALUES (
    p_user_id, TRUE, 'periodic_review',
    'Periodic Review Touch',
    'Annual check-in for customers who haven''t provided feedback',
    'Engagement', 'Active', '10:00', 'America/Chicago', 'Daily',
    NULL, 365, TRUE,
    '{
      "groups": [{
        "logic": "AND",
        "conditions": [
          {"field": "survey_feedback_pc", "operator": "is_blank", "value": null},
          {"field": "survey_stars", "operator": "is_blank", "value": null}
        ]
      }]
    }'::jsonb,
    '[
      {"id": "trigger", "type": "trigger", "title": "No Feedback Recorded"},
      {"id": "node-1", "type": "send_email", "title": "Send Review Request", "config": {"templateKey": "periodic_review"}}
    ]'::jsonb
  );

END;
$$ LANGUAGE plpgsql;


-- ============================================
-- FUNCTION: Create user settings for a user
-- ============================================
CREATE OR REPLACE FUNCTION create_default_user_settings(p_user_id TEXT)
RETURNS void AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Get user info from users table
  SELECT * INTO v_user FROM users WHERE user_unique_id = p_user_id;
  
  INSERT INTO user_settings (
    user_id, 
    signature_name, 
    signature_email,
    from_name,
    from_email,
    reply_to_email,
    timezone,
    default_send_time
  ) VALUES (
    p_user_id,
    CONCAT(v_user.first_name, ' ', v_user.last_name),
    v_user.email,
    CONCAT(v_user.first_name, ' ', v_user.last_name),
    v_user.email,
    v_user.email,
    'America/Chicago',
    '10:00'
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- TRIGGER: Auto-create defaults when user added
-- ============================================
CREATE OR REPLACE FUNCTION on_user_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Create default email templates
  PERFORM create_default_templates_for_user(NEW.user_unique_id);
  
  -- Create default automations
  PERFORM create_default_automations_for_user(NEW.user_unique_id);
  
  -- Create user settings
  PERFORM create_default_user_settings(NEW.user_unique_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_created_trigger
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION on_user_created();


-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if email is suppressed
CREATE OR REPLACE FUNCTION is_email_suppressed(
  p_email VARCHAR(255),
  p_automation_id INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check global unsubscribe
  IF EXISTS (
    SELECT 1 FROM unsubscribes
    WHERE email = p_email 
      AND is_active = TRUE 
      AND unsubscribe_type = 'all'
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check automation-specific unsubscribe
  IF p_automation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM unsubscribes
    WHERE email = p_email 
      AND is_active = TRUE 
      AND unsubscribe_type = 'automation'
      AND automation_id = p_automation_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  -- Check accounts table opt-out flag
  IF EXISTS (
    SELECT 1 FROM accounts
    WHERE (person_email = p_email OR email = p_email)
      AND person_has_opted_out_of_email = TRUE
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;


-- Check if account can enroll in automation
CREATE OR REPLACE FUNCTION can_enroll_in_automation(
  p_account_id TEXT,
  p_automation_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_automation RECORD;
  v_last_enrollment RECORD;
  v_enrollment_count INTEGER;
BEGIN
  -- Get automation settings
  SELECT * INTO v_automation FROM automations WHERE id = p_automation_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Get last enrollment for this account/automation
  SELECT * INTO v_last_enrollment 
  FROM automation_enrollments 
  WHERE account_id = p_account_id AND automation_id = p_automation_id
  ORDER BY enrolled_at DESC
  LIMIT 1;
  
  -- Count total enrollments
  SELECT COUNT(*) INTO v_enrollment_count
  FROM automation_enrollments
  WHERE account_id = p_account_id AND automation_id = p_automation_id;
  
  -- Check max enrollments
  IF v_automation.max_enrollments IS NOT NULL AND v_enrollment_count >= v_automation.max_enrollments THEN
    RETURN FALSE;
  END IF;
  
  -- Check cooldown period
  IF v_last_enrollment IS NOT NULL AND v_automation.enrollment_cooldown_days > 0 THEN
    IF v_last_enrollment.enrolled_at > NOW() - (v_automation.enrollment_cooldown_days || ' days')::INTERVAL THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Check if currently enrolled (active)
  IF v_last_enrollment IS NOT NULL AND v_last_enrollment.status = 'Active' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- Get email stats for date range
CREATE OR REPLACE FUNCTION get_email_stats(
  p_owner_id TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_automation_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  total_sent BIGINT,
  total_delivered BIGINT,
  total_opened BIGINT,
  unique_opens BIGINT,
  total_clicked BIGINT,
  unique_clicks BIGINT,
  total_bounced BIGINT,
  open_rate DECIMAL,
  click_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::BIGINT,
    COALESCE(SUM(open_count), 0)::BIGINT,
    COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL)::BIGINT,
    COALESCE(SUM(click_count), 0)::BIGINT,
    COUNT(*) FILTER (WHERE first_clicked_at IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE bounced_at IS NOT NULL)::BIGINT,
    CASE WHEN COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) > 0 
      THEN ROUND(COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL)::DECIMAL / COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) * 100, 2) 
      ELSE 0 
    END,
    CASE WHEN COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL) > 0 
      THEN ROUND(COUNT(*) FILTER (WHERE first_clicked_at IS NOT NULL)::DECIMAL / COUNT(*) FILTER (WHERE first_opened_at IS NOT NULL) * 100, 2) 
      ELSE 0 
    END
  FROM email_logs
  WHERE owner_id = p_owner_id 
    AND sent_at >= p_start_date 
    AND sent_at < p_end_date + INTERVAL '1 day'
    AND (p_automation_id IS NULL OR automation_id = p_automation_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_stats_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mass_email_batches ENABLE ROW LEVEL SECURITY;

-- Policies: Owner only
CREATE POLICY email_templates_policy ON email_templates FOR ALL USING (owner_id = current_setting('app.current_user_id', true));
CREATE POLICY automations_policy ON automations FOR ALL USING (owner_id = current_setting('app.current_user_id', true));
CREATE POLICY email_logs_policy ON email_logs FOR ALL USING (owner_id = current_setting('app.current_user_id', true));
CREATE POLICY scheduled_emails_policy ON scheduled_emails FOR ALL USING (owner_id = current_setting('app.current_user_id', true));
CREATE POLICY activity_log_policy ON activity_log FOR ALL USING (owner_id = current_setting('app.current_user_id', true));
CREATE POLICY email_stats_policy ON email_stats_daily FOR ALL USING (owner_id = current_setting('app.current_user_id', true));
CREATE POLICY user_settings_policy ON user_settings FOR ALL USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY mass_email_batches_policy ON mass_email_batches FOR ALL USING (owner_id = current_setting('app.current_user_id', true));


-- ============================================
-- MANUAL FUNCTION: Backfill existing users
-- Run this once after creating tables if you have existing users
-- ============================================
CREATE OR REPLACE FUNCTION backfill_defaults_for_existing_users()
RETURNS void AS $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN SELECT user_unique_id FROM users LOOP
    -- Only create if they don't already have defaults
    IF NOT EXISTS (SELECT 1 FROM email_templates WHERE owner_id = v_user.user_unique_id AND is_default = TRUE LIMIT 1) THEN
      PERFORM create_default_templates_for_user(v_user.user_unique_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM automations WHERE owner_id = v_user.user_unique_id AND is_default = TRUE LIMIT 1) THEN
      PERFORM create_default_automations_for_user(v_user.user_unique_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM user_settings WHERE user_id = v_user.user_unique_id) THEN
      PERFORM create_default_user_settings(v_user.user_unique_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Uncomment to run backfill:
-- SELECT backfill_defaults_for_existing_users();
