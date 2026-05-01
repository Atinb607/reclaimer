import React, { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../components/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', company_name: '', first_name: '', last_name: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    setErr(''); setLoading(true)
    try {
      let data
      if (tab === 'login') {
        data = await api.login(form.email, form.password)
      } else {
        data = await api.register({
          email: form.email,
          password: form.password,
          company_name: form.company_name,
          first_name: form.first_name,
          last_name: form.last_name,
        })
      }

      // Handle any token shape the backend might return
      const token = data.token
        || data.access_token
        || data.accessToken
        || data.data?.token
        || data.data?.access_token

      if (!token) {
        console.error('Full response:', JSON.stringify(data))
        setErr('Login succeeded but no token received. Check console for response shape.')
        return
      }

      login(token, data.user || data.data?.user || {})
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card} className="fade-in">
        <div style={styles.logo}>
          <span style={styles.logoMark}>R</span>
          <span style={styles.logoText}>RECLAIMER</span>
        </div>
        <p style={styles.tagline}>Missed call automation platform</p>

        <div style={styles.tabs}>
          {['login', 'register'].map(t => (
            <button key={t} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => { setTab(t); setErr('') }}>
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <div style={styles.fields}>
          {tab === 'register' && <>
            <Input label="Company Name" value={form.company_name} onChange={set('company_name')} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input label="First Name" value={form.first_name} onChange={set('first_name')} />
              <Input label="Last Name" value={form.last_name} onChange={set('last_name')} />
            </div>
          </>}
          <Input label="Email" type="email" value={form.email} onChange={set('email')} />
          <Input label="Password" type="password" value={form.password} onChange={set('password')} />
        </div>

        {err && <p style={styles.err}>{err}</p>}

        <button style={styles.btn} onClick={submit} disabled={loading}>
          {loading ? <span className="spinner" /> : tab === 'login' ? 'Sign In →' : 'Create Account →'}
        </button>

        <p style={styles.hint}>API: reclaimer.onrender.com</p>
      </div>
    </div>
  )
}

const Input = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
    <input style={styles.input} {...props} />
  </div>
)

const styles = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)',
    backgroundImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(232,255,71,0.06) 0%, transparent 70%)',
  },
  card: {
    width: 420, background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '40px 36px', display: 'flex', flexDirection: 'column', gap: 20,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoMark: {
    width: 36, height: 36, background: 'var(--accent)', color: '#000',
    fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  },
  logoText: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 20, letterSpacing: '0.06em' },
  tagline: { fontSize: 12, color: 'var(--text3)', marginTop: -10 },
  tabs: { display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 3 },
  tab: {
    flex: 1, padding: '8px 0', background: 'none', border: 'none',
    color: 'var(--text3)', borderRadius: 6, fontSize: 13, transition: 'all 0.2s',
  },
  tabActive: { background: 'var(--bg2)', color: 'var(--text)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  fields: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none',
    transition: 'border-color 0.2s',
  },
  err: { color: 'var(--red)', fontSize: 12, background: 'rgba(255,71,87,0.08)', padding: '8px 12px', borderRadius: 6 },
  btn: {
    background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
    padding: '12px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14,
    letterSpacing: '0.04em', transition: 'all 0.2s', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  hint: { fontSize: 11, color: 'var(--text3)', textAlign: 'center' },
}