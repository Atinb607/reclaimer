const BASE = 'https://reclaimer.onrender.com'

let _token = localStorage.getItem('rcl_token') || null
let _companyId = localStorage.getItem('rcl_company') || null

export const setToken = (t) => {
  _token = t
  if (t) localStorage.setItem('rcl_token', t)
  else localStorage.removeItem('rcl_token')
}

export const setCompanyId = (id) => {
  _companyId = id
  if (id) localStorage.setItem('rcl_company', id)
  else localStorage.removeItem('rcl_company')
}

export const getToken = () => _token
export const getCompanyId = () => _companyId

const req = async (method, path, body) => {
  const headers = { 'Content-Type': 'application/json' }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`)
  return data
}

const cid = () => _companyId

export const api = {
  // Auth
  login:    (email, password) => req('POST', '/auth/login', { email, password }),
  register: (body)            => req('POST', '/auth/register', body),

  // Health
  health:         () => req('GET', '/health'),
  healthDetailed: () => req('GET', '/health/detailed'),

  // Leads
  getLeads:   (page = 1, limit = 20) => req('GET', `/leads?page=${page}&limit=${limit}&company_id=${cid()}`),
  createLead: (body)                  => req('POST', '/leads', { ...body, company_id: cid() }),
  getLead:    (id)                    => req('GET', `/leads/${id}`),
  updateLead: (id, body)              => req('PUT', `/leads/${id}`, body),
  deleteLead: (id)                    => req('DELETE', `/leads/${id}`),

  // Automation rules
  getRules:   () => req('GET', `/automation/rules?company_id=${cid()}`),
  getStats:   () => req('GET', `/automation/stats?company_id=${cid()}`),
  createRule: (body) => req('POST', '/automation/rules', { ...body, company_id: cid() }),
  toggleRule: (id, active) => req('PUT', `/automation/rules/${id}`, { is_active: active }),

  // Webhooks
  missedCall: (body) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const { company_id, ...rest } = body
    const payload = (company_id && UUID_RE.test(company_id))
      ? { ...rest, company_id }
      : rest
    return req('POST', '/webhooks/missed-call', payload)
  },
}