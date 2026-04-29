// tests/auth.test.js
require('dotenv').config();
const request = require('supertest');
const app = require('../src/index');
const db = require('../src/models/db');

// Unique email per test run so re-runs don't collide
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'Password123!';

let authToken;
let companyId;

afterAll(async () => {
  // Clean up test user + company created during tests
  await db.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
  // db.end() is handled globally in tests/teardown.js
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /auth/register', () => {

  it('creates a user and company, returns JWT', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        first_name: 'Test',
        last_name: 'User',
        company_name: 'Test Co',
        industry: 'hvac',
        timezone: 'America/New_York',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.company.name).toBe('Test Co');

    authToken = res.body.data.token;
    companyId = res.body.data.company.id;
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        first_name: 'Test',
        last_name: 'User',
        company_name: 'Another Co',
        industry: 'hvac',
        timezone: 'America/New_York',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'incomplete@example.com' });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /auth/login', () => {

  it('returns JWT for valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.user.password_hash).toBeUndefined(); // never exposed
    expect(res.body.data.companies.length).toBeGreaterThan(0);
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /auth/me', () => {

  it('returns current user with valid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
  });

  it('rejects missing token with 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token with 401', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer totallyinvalidtoken');
    expect(res.status).toBe(401);
  });
});