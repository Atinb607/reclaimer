// tests/automationEngine.test.js
require('dotenv').config();
const db = require('../src/models/db');
const { preSendChecks, triggerAutomation, handleLeadReply } = require('../src/services/automationEngine');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createCompany(name = 'Engine Test Co') {
  const { rows: [c] } = await db.query(
    `INSERT INTO companies (name, industry, timezone)
     VALUES ($1, 'hvac', 'America/New_York') RETURNING id`,
    [name]
  );
  return c.id;
}

async function createLead(companyId, overrides = {}) {
  const { rows: [l] } = await db.query(
    `INSERT INTO leads (company_id, phone, first_name, status, has_replied)
     VALUES ($1, $2, 'Test', $3, $4) RETURNING id`,
    [
      companyId,
      overrides.phone || `+1555${Date.now().toString().slice(-7)}`,
      overrides.status || 'new',
      overrides.has_replied || false,
    ]
  );
  return l.id;
}

async function createRule(companyId, overrides = {}) {
  const { rows: [r] } = await db.query(
    `INSERT INTO automation_rules (company_id, name, trigger_type, delay_minutes, message_template, is_active)
     VALUES ($1, 'Test Rule', $2, $3, 'Hi {{first_name}}!', $4) RETURNING id`,
    [
      companyId,
      overrides.trigger_type || 'missed_call',
      overrides.delay_minutes || 0,
      overrides.is_active !== undefined ? overrides.is_active : true,
    ]
  );
  return r.id;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

let createdCompanyIds = [];

afterAll(async () => {
  for (const id of createdCompanyIds) {
    await db.query('DELETE FROM companies WHERE id = $1', [id]);
  }
  // db.end() is handled globally in tests/teardown.js
});

// ─────────────────────────────────────────────────────────────────────────────
describe('preSendChecks()', () => {

  let companyId, leadId, ruleId;

  beforeAll(async () => {
    companyId = await createCompany('preSendChecks Co');
    createdCompanyIds.push(companyId);
    leadId = await createLead(companyId);
    ruleId = await createRule(companyId);
  });

  it('returns shouldSend=true for a clean lead + active rule', async () => {
    const result = await preSendChecks(leadId, ruleId, 'job-test-1');
    expect(result.shouldSend).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('returns shouldSend=false when lead has replied', async () => {
    const repliedLeadId = await createLead(companyId, { has_replied: true });
    const result = await preSendChecks(repliedLeadId, ruleId, 'job-test-2');
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('lead_replied');
  });

  it('returns shouldSend=false when lead is do_not_contact', async () => {
    const dncLeadId = await createLead(companyId, { status: 'do_not_contact' });
    const result = await preSendChecks(dncLeadId, ruleId, 'job-test-3');
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('do_not_contact');
  });

  it('returns shouldSend=false when lead does not exist', async () => {
    const result = await preSendChecks('00000000-0000-0000-0000-000000000000', ruleId, 'job-test-4');
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('lead_not_found');
  });

  it('returns shouldSend=false when rule is inactive', async () => {
    const inactiveRuleId = await createRule(companyId, { is_active: false });
    const result = await preSendChecks(leadId, inactiveRuleId, 'job-test-5');
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('rule_inactive');
  });

  it('returns shouldSend=false when message already sent for this rule', async () => {
    // Insert a fake sent message for this lead+rule
    await db.query(
      `INSERT INTO messages (company_id, lead_id, automation_rule_id, direction, body, status, provider)
       VALUES ($1, $2, $3, 'outbound', 'Already sent', 'delivered', 'twilio')`,
      [companyId, leadId, ruleId]
    );
    const result = await preSendChecks(leadId, ruleId, 'job-test-6');
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe('already_sent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('triggerAutomation()', () => {

  let companyId, leadId, ruleId, eventId;

  beforeAll(async () => {
    companyId = await createCompany('triggerAutomation Co');
    createdCompanyIds.push(companyId);
    leadId = await createLead(companyId);
    ruleId = await createRule(companyId, { delay_minutes: 0 });

    const { rows: [e] } = await db.query(
      `INSERT INTO events (company_id, lead_id, event_type, source, raw_payload)
       VALUES ($1, $2, 'missed_call', 'test', '{}') RETURNING id`,
      [companyId, leadId]
    );
    eventId = e.id;
  });

  it('skips automation for DNC lead', async () => {
    const dncLeadId = await createLead(companyId, { status: 'do_not_contact' });
    const result = await triggerAutomation(dncLeadId, companyId, 'missed_call', eventId);
    expect(result.scheduled).toBe(0);
    expect(result.reason).toBe('do_not_contact');
  });

  it('skips automation for lead that has already replied', async () => {
    const repliedLeadId = await createLead(companyId, { has_replied: true });
    const result = await triggerAutomation(repliedLeadId, companyId, 'missed_call', eventId);
    expect(result.scheduled).toBe(0);
    expect(result.reason).toBe('has_replied');
  });

  it('returns no_rules when no active rules match the trigger type', async () => {
    const result = await triggerAutomation(leadId, companyId, 'nonexistent_trigger', eventId);
    expect(result.scheduled).toBe(0);
    expect(result.reason).toBe('no_rules');
  });

  it('throws for a non-existent lead', async () => {
    await expect(
      triggerAutomation('00000000-0000-0000-0000-000000000000', companyId, 'missed_call', eventId)
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('handleLeadReply()', () => {

  let companyId, leadId;

  beforeAll(async () => {
    companyId = await createCompany('handleLeadReply Co');
    createdCompanyIds.push(companyId);
    leadId = await createLead(companyId);
  });

  it('marks lead as replied and status engaged', async () => {
    await handleLeadReply(leadId, companyId);

    const { rows: [lead] } = await db.query(
      'SELECT has_replied, status FROM leads WHERE id = $1',
      [leadId]
    );

    expect(lead.has_replied).toBe(true);
    expect(lead.status).toBe('engaged');
  });

  it('cancels pending jobs_log entries for the lead', async () => {
    // Seed a pending jobs_log entry
    await db.query(
      `INSERT INTO jobs_log (company_id, lead_id, job_id, job_type, status, payload)
       VALUES ($1, $2, $3, 'automation-message', 'pending', '{}')`,
      [companyId, leadId, `test-job-${Date.now()}`]
    );

    await handleLeadReply(leadId, companyId);

    const { rows } = await db.query(
      `SELECT status FROM jobs_log WHERE lead_id = $1 AND status = 'pending'`,
      [leadId]
    );
    expect(rows.length).toBe(0);
  });
});