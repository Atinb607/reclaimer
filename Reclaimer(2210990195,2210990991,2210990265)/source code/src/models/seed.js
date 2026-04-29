require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const logger = require('../utils/logger');

async function seed() {
  logger.info('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  await db.transaction(async (client) => {
    // Create demo user
    const { rows: [user] } = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ('demo@example.com', $1, 'Demo', 'User', 'owner')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [passwordHash]
    );
    logger.info('Created user:', user.id);

    // Create demo company
    const { rows: [company] } = await client.query(
      `INSERT INTO companies (name, industry, timezone, plan)
       VALUES ('Demo HVAC Co', 'hvac', 'America/New_York', 'growth')
       ON CONFLICT DO NOTHING
       RETURNING id`
    );

    if (company) {
      // Link user to company
      await client.query(
        `INSERT INTO company_users (company_id, user_id, role)
         VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
        [company.id, user.id]
      );

      // Create automation rules
      await client.query(
        `INSERT INTO automation_rules (company_id, name, trigger_type, delay_minutes, message_template, step_order)
         VALUES
           ($1, 'Immediate Missed Call Follow-up', 'missed_call', 0,
            'Hi {{first_name}}, this is {{company_name}}. We missed your call and want to help! Can we schedule a time to discuss your HVAC needs?', 1),
           ($1, '30-min Follow-up', 'missed_call', 30,
            'Hi {{first_name}}, just following up from {{company_name}}. We''d love to help with your HVAC needs. Reply YES to schedule a free estimate!', 2),
           ($1, '24-hour Follow-up', 'missed_call', 1440,
            'Hi {{first_name}}, last message from {{company_name}}. We''re still here to help! Book your free estimate at {{booking_link}}', 3)
         ON CONFLICT DO NOTHING`,
        [company.id]
      );

      logger.info('Created company and automation rules:', company.id);
    }
  });

  logger.info('✅ Seed complete');
  logger.info('\n📧 Login: demo@example.com / Password123!');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };
