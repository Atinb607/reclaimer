// tests/webhooks.test.js
require('dotenv').config();
const request = require('supertest');
const app = require('../src/index');
const db = require('../src/models/db');
const { normalizePhone } = require('../src/utils/phone');

// ── Mock the queue so tests never enqueue real BullMQ jobs into Redis ─────────
// Without this, the missed-call test enqueues a job with a fake company_id,
// and the worker retries it forever with a foreign key error.
jest.mock('../src/services/queue', () => ({
  scheduleWebhookJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  scheduleAutomationJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  cancelLeadJobs: jest.fn().mockResolvedValue(0),
  getQueueStats: jest.fn().mockResolvedValue({}),
  automationQueue: { close: jest.fn() },
  resurrectionQueue: { close: jest.fn() },
  webhookProcessingQueue: { close: jest.fn() },
  automationEvents: { close: jest.fn() },
}));

// ─────────────────────────────────────────────────────────────────────────────
describe('normalizePhone()', () => {

  it('normalizes 10-digit US number to E.164', () => {
    expect(normalizePhone('5551234567')).toBe('+15551234567');
  });

  it('normalizes 11-digit US number with leading 1', () => {
    expect(normalizePhone('15551234567')).toBe('+15551234567');
  });

  it('keeps already-formatted E.164 number unchanged', () => {
    expect(normalizePhone('+15551234567')).toBe('+15551234567');
  });

  it('strips formatting characters', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('555-123-4567')).toBe('+15551234567');
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('returns null/undefined as-is', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /webhooks/missed-call', () => {

  let companyId;

  beforeAll(async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO companies (name, industry, timezone)
       VALUES ('Webhook Test Co', 'hvac', 'America/New_York') RETURNING id`
    );
    companyId = c.id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
  });

  it('returns 202 and queues job for valid payload', async () => {
    const res = await request(app)
      .post('/webhooks/missed-call')
      .send({
        company_id: companyId,
        caller_phone: '+15551234567',
        caller_name: 'John Smith',
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/queued/i);
  });

  it('returns 404 for unknown company_id', async () => {
    const res = await request(app)
      .post('/webhooks/missed-call')
      .send({
        company_id: '00000000-0000-0000-0000-000000000000',
        caller_phone: '+15551234567',
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when caller_phone is missing', async () => {
    const res = await request(app)
      .post('/webhooks/missed-call')
      .send({ company_id: companyId });

    expect(res.status).toBe(400);
  });

  it('returns 400 when company_id is not a valid UUID', async () => {
    const res = await request(app)
      .post('/webhooks/missed-call')
      .send({ company_id: 'not-a-uuid', caller_phone: '+15551234567' });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /webhooks/twilio-inbound — keyword handling', () => {

  let companyId, leadId;

  beforeAll(async () => {
    const { rows: [c] } = await db.query(
      `INSERT INTO companies (name, industry, timezone)
       VALUES ('Twilio Test Co', 'hvac', 'America/New_York') RETURNING id`
    );
    companyId = c.id;

    const { rows: [l] } = await db.query(
      `INSERT INTO leads (company_id, phone, first_name, status)
       VALUES ($1, '+15559876543', 'Jane', 'contacted') RETURNING id`,
      [companyId]
    );
    leadId = l.id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
  });

  it('handles STOP keyword — marks lead DNC and returns unsubscribe TwiML', async () => {
    const res = await request(app)
      .post('/webhooks/twilio-inbound')
      .type('form')
      .send({ From: '+15559876543', Body: 'STOP', MessageSid: 'SM_test_stop' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('unsubscribed');

    const { rows: [lead] } = await db.query(
      'SELECT status FROM leads WHERE id = $1', [leadId]
    );
    expect(lead.status).toBe('do_not_contact');
  });

  it('handles START keyword — re-enables lead and returns resubscribe TwiML', async () => {
    const res = await request(app)
      .post('/webhooks/twilio-inbound')
      .type('form')
      .send({ From: '+15559876543', Body: 'START', MessageSid: 'SM_test_start' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('resubscribed');

    const { rows: [lead] } = await db.query(
      'SELECT status FROM leads WHERE id = $1', [leadId]
    );
    expect(lead.status).toBe('new');
  });

  it('handles HELP keyword — returns help TwiML', async () => {
    const res = await request(app)
      .post('/webhooks/twilio-inbound')
      .type('form')
      .send({ From: '+15559876543', Body: 'HELP', MessageSid: 'SM_test_help' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('STOP');
  });

  it('handles normal reply — stores message and returns empty TwiML', async () => {
    const res = await request(app)
      .post('/webhooks/twilio-inbound')
      .type('form')
      .send({ From: '+15559876543', Body: 'Yes I am interested', MessageSid: 'SM_test_reply' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('<Response></Response>');

    const { rows } = await db.query(
      `SELECT * FROM messages WHERE lead_id = $1 AND direction = 'inbound' AND provider_sid = 'SM_test_reply'`,
      [leadId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].body).toBe('Yes I am interested');
  });

  it('returns empty TwiML for unknown phone number', async () => {
    const res = await request(app)
      .post('/webhooks/twilio-inbound')
      .type('form')
      .send({ From: '+15550000000', Body: 'Hello', MessageSid: 'SM_test_unknown' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('<Response></Response>');
  });
});