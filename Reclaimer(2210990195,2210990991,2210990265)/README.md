# 🚀 SaaS Automation Platform

Multi-tenant SMS automation platform for service businesses (HVAC, plumbing, etc.). Captures inbound leads from missed calls and form submissions, then drives multi-step SMS follow-up sequences that auto-stop on reply.

---

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   API Backend   │    │   BullMQ Worker │    │   PostgreSQL     │
│   (Express.js)  │───▶│  (Automation)   │───▶│  (Multi-tenant)  │
└─────────────────┘    └─────────────────┘    └──────────────────┘
         │                      │                       │
         ▼                      ▼                       │
┌─────────────────┐    ┌─────────────────┐             │
│  Redis (BullMQ) │    │  Twilio API     │             │
│  (Job Queues)   │    │  (SMS Send)     │◀────────────┘
└─────────────────┘    └─────────────────┘
```

### Queues
- **automationQueue** — Delayed SMS send jobs (per rule/lead/event)
- **resurrectionQueue** — Re-engagement campaigns
- **webhookProcessingQueue** — Async webhook ingestion

---

## 🚦 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Twilio account

### 1. Clone & Configure

```bash
git clone <your-repo>
cd saas-automation
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start with Docker

```bash
docker-compose up -d
```

### 3. Run Migrations & Seed

```bash
# Run in the backend container
docker-compose exec backend npm run migrate
docker-compose exec backend npm run seed
```

### 4. Test the API

```bash
# Register / login
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"Password123!"}'
```

---

## 📊 API Reference

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register user + create company |
| POST | `/auth/login` | Login, get JWT |
| GET | `/auth/me` | Get current user |

### Leads
| Method | Path | Description |
|--------|------|-------------|
| POST | `/leads` | Create/upsert lead |
| GET | `/leads?company_id=` | List leads (paginated) |
| GET | `/leads/:id` | Lead detail + message history |
| PATCH | `/leads/:id` | Update lead |
| DELETE | `/leads/:id` | Soft delete |

### Automation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/automation/rules` | Create rule |
| GET | `/automation/rules?company_id=` | List rules |
| PATCH | `/automation/rules/:id` | Update rule |
| DELETE | `/automation/rules/:id` | Soft delete rule |
| GET | `/automation/stats?company_id=` | 30-day stats |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/missed-call` | Missed call event |
| POST | `/webhooks/inbound/:companyId/:integrationId` | Generic integration webhook |
| POST | `/webhooks/twilio-inbound` | Twilio inbound SMS |
| POST | `/webhooks/twilio-status` | Twilio delivery status |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic ping |
| GET | `/health/detailed` | Full system status |

---

## 🔄 Automation Flow

```
Missed Call / Form Submission
         │
         ▼
  POST /webhooks/missed-call
         │
         ▼
  scheduleWebhookJob()  ──────── Returns 202 immediately
         │
         ▼  (async worker)
  processMissedCall()
         │
         ├── Upsert Lead
         ├── Create Event
         │
         ▼
  triggerAutomation()
         │
         ├── Check DNC / has_replied
         ├── Fetch active rules (ORDER BY delay_minutes)
         │
         └── For each rule:
               scheduleAutomationJob(delay=rule.delay_minutes)
               Store idempotency key → prevents double-scheduling

──── delay_minutes later ────

  BullMQ Worker processes job
         │
         ├── preSendChecks()
         │     ├── Lead still exists?
         │     ├── Lead has_replied? → SKIP
         │     ├── Lead is DNC? → SKIP
         │     └── Message already sent? → SKIP
         │
         ├── renderTemplate(rule.message_template, leadData)
         │
         └── sendSMS() → Twilio API

──── Lead Replies via SMS ────

  POST /webhooks/twilio-inbound
         │
         ▼
  handleLeadReply()
         ├── Mark lead has_replied = TRUE
         ├── Update status = 'engaged'
         └── cancelLeadJobs() → removes all delayed jobs
```

---

## 🔒 Security

- **JWT Auth** — All API routes require `Authorization: Bearer <token>`
- **Rate Limiting** — Global 100 req/15min, auth 20/15min, webhooks 500/min
- **Helmet** — Full HTTP security headers
- **Input Validation** — Joi on all endpoints
- **SQL Injection** — Parameterized queries only
- **Webhook Validation** — Twilio signature verification in production
- **API Key Encryption** — AES-256-GCM at rest
- **Multi-tenant Isolation** — Every query scoped by `company_id`

---

## 📈 Scaling Strategy

| Concern | Solution |
|---------|----------|
| API stateless | Deploy N replicas behind load balancer |
| SMS at scale | BullMQ with concurrency control + rate limiting |
| DB performance | Connection pooling (pg-pool), indexed queries |
| No double-sends | Idempotency keys on every job (BullMQ jobId) |
| Worker scaling | Scale worker containers independently |
| Queue monitoring | BullMQ job events + jobs_log table |

---

## 🐳 Production Deployment

### Render.com (Recommended for quick start)
```yaml
# render.yaml
services:
  - type: web
    name: saas-automation-api
    env: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: NODE_ENV
        value: production
  
  - type: worker
    name: saas-automation-worker
    env: docker
    dockerfilePath: ./Dockerfile
    dockerCommand: node src/workers/automationWorker.js
```

### Environment Variables (Production Checklist)
```
✅ JWT_SECRET — 64+ random chars
✅ ENCRYPTION_KEY — exactly 32 chars
✅ DB_SSL=true — for managed Postgres
✅ REDIS_TLS=true — for managed Redis
✅ SENTRY_DSN — error monitoring
✅ TWILIO_* — all 4 variables set
✅ HEALTH_API_KEY — protect /health/detailed
```

---

## 💬 SMS Template Variables

Use `{{variable}}` in rule message templates:

| Variable | Description |
|----------|-------------|
| `{{first_name}}` | Lead's first name |
| `{{last_name}}` | Lead's last name |
| `{{full_name}}` | Full name |
| `{{company_name}}` | Company name |
| `{{booking_link}}` | From company settings |
| `{{service_type}}` | Company industry |

**Example:**
```
Hi {{first_name}}, this is {{company_name}}! We missed your call.
Book a free estimate: {{booking_link}}
```

---

## 📁 Project Structure

```
src/
├── index.js               # Express app entry
├── models/
│   ├── db.js              # PostgreSQL pool
│   ├── migrate.js         # Schema migrations
│   └── seed.js            # Development seed
├── routes/
│   ├── auth.js            # Auth endpoints
│   ├── leads.js           # Lead CRUD
│   ├── automation.js      # Rule management
│   ├── webhooks.js        # Inbound events
│   ├── companies.js       # Company management
│   └── health.js          # Health checks
├── middleware/
│   ├── auth.js            # JWT + company auth
│   ├── rateLimiter.js     # Express rate limit
│   ├── validators.js      # Joi schemas
│   ├── requestLogger.js   # Winston request logs
│   └── errorHandler.js    # Global error handler
├── services/
│   ├── queue.js           # BullMQ queue definitions
│   ├── automationEngine.js # Core automation logic
│   ├── smsService.js      # Twilio integration
│   └── webhookProcessor.js # Webhook payload handling
├── workers/
│   └── automationWorker.js # BullMQ workers
└── utils/
    ├── logger.js          # Winston logger
    ├── redis.js           # Redis client
    ├── encryption.js      # AES-256-GCM
    ├── template.js        # Message rendering
    └── sentry.js          # Error tracking
```
