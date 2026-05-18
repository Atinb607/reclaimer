const BASE = 'https://reclaimer.onrender.com'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Read token fresh from localStorage so it survives page reloads
const getStoredToken   = () => localStorage.getItem('rcl_token')   || null
const getStoredCompany = () => localStorage.getItem('rcl_company') || null

let _token     = getStoredToken()
let _companyId = getStoredCompany()

export const setToken = (t) => {
  _token = t
  if (t) localStorage.setItem('rcl_token', t)
  else   localStorage.removeItem('rcl_token')
}

export const setCompanyId = (id) => {
  _companyId = id
  if (id) localStorage.setItem('rcl_company', id)
  else    localStorage.removeItem('rcl_company')
}

export const getToken     = () => _token     || getStoredToken()
export const getCompanyId = () => _companyId || getStoredCompany()

const req = async (method, path, body) => {
  // Always pull the latest token — handles reloads and multi-tab
  const token = _token || getStoredToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`)
  return data
}

// Returns company_id only if it's a valid UUID — never returns null/undefined string
const cid = () => {
  const id = _companyId || getStoredCompany()
  return (id && UUID_RE.test(id)) ? id : null
}

// Builds query string, skipping any params with null/undefined values
const qs = (params) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return parts.length ? '?' + parts.join('&') : ''
}

export const api = {
  // Auth
  login:    (email, password) => req('POST', '/auth/login', { email, password }),
  register: (body)            => req('POST', '/auth/register', body),

  // Health
  health:         () => req('GET', '/health'),
  healthDetailed: () => req('GET', '/health/detailed'),

  // Leads — company_id omitted from query/body when null
  getLeads:   (page = 1, limit = 20) => req('GET', `/leads${qs({ page, limit, company_id: cid() })}`),
  createLead: (body)                  => req('POST', '/leads', { ...body, ...(cid() ? { company_id: cid() } : {}) }),
  getLead:    (id)                    => req('GET', `/leads/${id}`),
  updateLead: (id, body)              => req('PUT', `/leads/${id}`, body),
  deleteLead: (id)                    => req('DELETE', `/leads/${id}`),

  // Automation rules — company_id omitted when null
  getRules:   () => req('GET', `/automation/rules${qs({ company_id: cid() })}`),
  getStats:   () => req('GET', `/automation/stats${qs({ company_id: cid() })}`),
  createRule: (body) => req('POST', '/automation/rules', { ...body, ...(cid() ? { company_id: cid() } : {}) }),
  toggleRule: (id, active) => req('PUT', `/automation/rules/${id}`, { is_active: active }),

  // Webhooks — strip company_id if blank or not a valid UUID
  missedCall: (body) => {
    const { company_id, ...rest } = body
    const payload = (company_id && UUID_RE.test(company_id))
      ? { ...rest, company_id }
      : rest
    return req('POST', '/webhooks/missed-call', payload)
  },
}