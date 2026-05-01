const BASE = 'https://reclaimer.onrender.com'

let _token = localStorage.getItem('rcl_token') || null

export const setToken = (t) => {
  _token = t
  if (t) localStorage.setItem('rcl_token', t)
  else localStorage.removeItem('rcl_token')
}

export const getToken = () => _token

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

export const api = {
  // Auth
  login:    (email, password) => req('POST', '/auth/login', { email, password }),
  register: (body)            => req('POST', '/auth/register', body),

  // Health
  health:         () => req('GET', '/health'),
  healthDetailed: () => req('GET', '/health/detailed'),

  // Leads
  getLeads:   (page = 1, limit = 20) => req('GET', `/leads?page=${page}&limit=${limit}`),
  createLead: (body)                  => req('POST', '/leads', body),
  getLead:    (id)                    => req('GET', `/leads/${id}`),
  updateLead: (id, body)              => req('PUT', `/leads/${id}`, body),
  deleteLead: (id)                    => req('DELETE', `/leads/${id}`),

  // Automation rules
  getRules:   ()     => req('GET', '/automation/rules'),
  getStats:   ()     => req('GET', '/automation/stats'),
  createRule: (body) => req('POST', '/automation/rules', body),
  toggleRule: (id, active) => req('PUT', `/automation/rules/${id}`, { is_active: active }),

  // Webhooks
  missedCall: (body) => req('POST', '/webhooks/missed-call', body),
}
