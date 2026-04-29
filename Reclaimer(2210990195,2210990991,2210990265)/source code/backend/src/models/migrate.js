require('dotenv').config();
const db = require('./db');
const logger = require('../utils/logger');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Enable UUID extension
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- ─── USERS ──────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email           VARCHAR(255) UNIQUE NOT NULL,
        password_hash   VARCHAR(255) NOT NULL,
        first_name      VARCHAR(100) NOT NULL,
        last_name       VARCHAR(100) NOT NULL,
        role            VARCHAR(50) NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'owner', 'manager')),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );

      -- ─── COMPANIES ──────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS companies (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        industry        VARCHAR(100) NOT NULL DEFAULT 'hvac',
        phone           VARCHAR(20),
        email           VARCHAR(255),
        address         TEXT,
        timezone        VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
        plan            VARCHAR(50) NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'enterprise')),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        settings        JSONB NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );

      -- ─── COMPANY USERS (multi-tenant membership) ────────────────────────────
      CREATE TABLE IF NOT EXISTS company_users (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role            VARCHAR(50) NOT NULL DEFAULT 'manager' CHECK (role IN ('owner', 'manager')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, user_id)
      );

      -- ─── LEADS ──────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS leads (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        first_name      VARCHAR(100),
        last_name       VARCHAR(100),
        phone           VARCHAR(20) NOT NULL,
        email           VARCHAR(255),
        source          VARCHAR(100),
        status          VARCHAR(50) NOT NULL DEFAULT 'new' 
                          CHECK (status IN ('new', 'contacted', 'engaged', 'qualified', 'converted', 'lost', 'do_not_contact')),
        has_replied     BOOLEAN NOT NULL DEFAULT FALSE,
        last_reply_at   TIMESTAMPTZ,
        metadata        JSONB NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ,
        CONSTRAINT leads_company_id_phone_unique UNIQUE (company_id, phone)
      );

      -- ─── EVENTS ─────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS events (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        event_type      VARCHAR(100) NOT NULL,  -- 'missed_call', 'form_submission', etc.
        source          VARCHAR(100),           -- 'twilio', 'highlevel', 'zapier', etc.
        raw_payload     JSONB NOT NULL DEFAULT '{}',
        processed       BOOLEAN NOT NULL DEFAULT FALSE,
        processed_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ─── AUTOMATION RULES ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS automation_rules (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        trigger_type    VARCHAR(100) NOT NULL,  -- 'missed_call', 'form_submission', 'inbound_lead'
        delay_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
        message_template TEXT NOT NULL,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        step_order      INTEGER NOT NULL DEFAULT 1,
        stop_on_reply   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );

      -- ─── MESSAGES ───────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS messages (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        automation_rule_id UUID REFERENCES automation_rules(id),
        direction       VARCHAR(20) NOT NULL CHECK (direction IN ('outbound', 'inbound')),
        body            TEXT NOT NULL,
        status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'failed', 'received')),
        provider        VARCHAR(50) NOT NULL DEFAULT 'twilio',
        provider_sid    VARCHAR(255),       -- Twilio message SID
        error_code      VARCHAR(50),
        error_message   TEXT,
        sent_at         TIMESTAMPTZ,
        delivered_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ─── JOBS LOG ───────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS jobs_log (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        lead_id         UUID REFERENCES leads(id),
        job_id          VARCHAR(255) UNIQUE NOT NULL,     -- BullMQ job ID
        job_type        VARCHAR(100) NOT NULL,
        status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
        payload         JSONB NOT NULL DEFAULT '{}',
        result          JSONB,
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_error      TEXT,
        scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at      TIMESTAMPTZ,
        completed_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ─── WEBHOOK INTEGRATIONS ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS webhook_integrations (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        provider        VARCHAR(100) NOT NULL,   -- 'twilio', 'highlevel', 'zapier', 'custom'
        name            VARCHAR(255),
        api_key_enc     TEXT,                    -- Encrypted API key
        webhook_secret  TEXT,                    -- For signature validation
        config          JSONB NOT NULL DEFAULT '{}',
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        last_event_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ─── INDEXES ────────────────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
      CREATE INDEX IF NOT EXISTS idx_leads_company_phone ON leads(company_id, phone);

      CREATE INDEX IF NOT EXISTS idx_events_company_id ON events(company_id);
      CREATE INDEX IF NOT EXISTS idx_events_lead_id ON events(lead_id);
      CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

      CREATE INDEX IF NOT EXISTS idx_automation_rules_company_id ON automation_rules(company_id);
      CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_type ON automation_rules(trigger_type);
      CREATE INDEX IF NOT EXISTS idx_automation_rules_delay ON automation_rules(delay_minutes);
      CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON automation_rules(is_active) WHERE is_active = TRUE;

      CREATE INDEX IF NOT EXISTS idx_messages_company_id ON messages(company_id);
      CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
      CREATE INDEX IF NOT EXISTS idx_messages_provider_sid ON messages(provider_sid);
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

      CREATE INDEX IF NOT EXISTS idx_jobs_log_company_id ON jobs_log(company_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_log_lead_id ON jobs_log(lead_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_log_job_id ON jobs_log(job_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_log_status ON jobs_log(status);

      CREATE INDEX IF NOT EXISTS idx_company_users_company_id ON company_users(company_id);
      CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON company_users(user_id);

      -- ─── UPDATE TRIGGER ──────────────────────────────────────────────────────
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      CREATE TRIGGER trg_automation_rules_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      CREATE TRIGGER trg_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
      CREATE TRIGGER trg_webhook_integrations_updated_at BEFORE UPDATE ON webhook_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

      -- ─── MIGRATIONS TRACKING ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  }
];

async function migrate() {
  logger.info('Running database migrations...');

  // Ensure migrations table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await db.query('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(applied.map(r => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      logger.info(`  ⏭  Migration ${migration.version} (${migration.name}) already applied`);
      continue;
    }

    logger.info(`  ⬆  Applying migration ${migration.version}: ${migration.name}`);
    await db.transaction(async (client) => {
      await client.query(migration.up);
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name]
      );
    });
    logger.info(`  ✅ Migration ${migration.version} applied`);
  }

  logger.info('✅ All migrations complete');
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };