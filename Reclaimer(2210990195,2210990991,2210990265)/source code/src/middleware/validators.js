const Joi = require('joi');

// ─── Auth ─────────────────────────────────────────────────────────────────────
const registerSchema = Joi.object({
  email: Joi.string().email().lowercase().max(255).required(),
  password: Joi.string().min(8).max(72).required(),
  first_name: Joi.string().trim().max(100).required(),
  last_name: Joi.string().trim().max(100).required(),
  company_name: Joi.string().trim().max(255).required(),
  industry: Joi.string().valid('hvac', 'plumbing', 'electrical', 'landscaping', 'cleaning', 'other').default('hvac'),
  timezone: Joi.string().max(100).default('America/New_York'),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

// ─── Leads ───────────────────────────────────────────────────────────────────
const createLeadSchema = Joi.object({
  company_id: Joi.string().uuid().required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/).required(),
  first_name: Joi.string().trim().max(100).allow('', null),
  last_name: Joi.string().trim().max(100).allow('', null),
  email: Joi.string().email().lowercase().max(255).allow('', null),
  source: Joi.string().trim().max(100).allow('', null),
  metadata: Joi.object().default({}),
});

const updateLeadSchema = Joi.object({
  first_name: Joi.string().trim().max(100).allow('', null),
  last_name: Joi.string().trim().max(100).allow('', null),
  email: Joi.string().email().lowercase().max(255).allow('', null),
  status: Joi.string().valid('new', 'contacted', 'engaged', 'qualified', 'converted', 'lost', 'do_not_contact'),
  metadata: Joi.object(),
}).min(1);

// ─── Automation Rules ─────────────────────────────────────────────────────────
const createAutomationRuleSchema = Joi.object({
  company_id: Joi.string().uuid().required(),
  name: Joi.string().trim().max(255).required(),
  trigger_type: Joi.string().valid('missed_call', 'form_submission', 'inbound_lead', 'manual').required(),
  delay_minutes: Joi.number().integer().min(0).max(43200).default(0), // max 30 days
  message_template: Joi.string().trim().max(1600).required(),  // SMS limit
  step_order: Joi.number().integer().min(1).default(1),
  stop_on_reply: Joi.boolean().default(true),
  is_active: Joi.boolean().default(true),
});

const updateAutomationRuleSchema = Joi.object({
  name: Joi.string().trim().max(255),
  trigger_type: Joi.string().valid('missed_call', 'form_submission', 'inbound_lead', 'manual'),
  delay_minutes: Joi.number().integer().min(0).max(43200),
  message_template: Joi.string().trim().max(1600),
  step_order: Joi.number().integer().min(1),
  stop_on_reply: Joi.boolean(),
  is_active: Joi.boolean(),
}).min(1);

// ─── Webhooks ─────────────────────────────────────────────────────────────────
const missedCallWebhookSchema = Joi.object({
  company_id: Joi.string().uuid().required(),
  caller_phone: Joi.string().required(),
  caller_name: Joi.string().allow('', null),
  called_at: Joi.string().isoDate().allow(null),
  metadata: Joi.object().default({}),
});

// ─── Validator helper ─────────────────────────────────────────────────────────
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map(d => d.message).join(', ');
      return res.status(400).json({ success: false, error: details });
    }

    req.body = value;
    next();
  };
}

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  createLeadSchema,
  updateLeadSchema,
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
  missedCallWebhookSchema,
};
