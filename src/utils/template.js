/**
 * Simple, safe template renderer for SMS messages
 * Supports {{variable}} syntax with XSS prevention
 */

const ALLOWED_VARS = new Set([
  'first_name', 'last_name', 'full_name', 'company_name',
  'phone', 'email', 'booking_link', 'service_type'
]);

/**
 * Render a message template with lead and company data
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Object} data - Data to interpolate
 * @returns {string} Rendered message
 */
function renderTemplate(template, data = {}) {
  if (!template) return '';
  
  // Sanitize input data
  const safeData = {};
  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_VARS.has(key) && typeof value === 'string') {
      // Strip any HTML/script tags from interpolated values
      safeData[key] = value.replace(/<[^>]*>/g, '').trim().substring(0, 200);
    }
  }

  // Add computed values
  if (safeData.first_name && safeData.last_name) {
    safeData.full_name = `${safeData.first_name} ${safeData.last_name}`;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return safeData[key] !== undefined ? safeData[key] : match;
  });
}

/**
 * Build template data from a lead and company record
 */
function buildTemplateData(lead, company) {
  return {
    first_name: lead.first_name || 'there',
    last_name: lead.last_name || '',
    full_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there',
    phone: lead.phone || '',
    email: lead.email || '',
    company_name: company.name || '',
    service_type: company.industry || 'service',
    booking_link: company.settings?.booking_link || '',
  };
}

module.exports = { renderTemplate, buildTemplateData };
