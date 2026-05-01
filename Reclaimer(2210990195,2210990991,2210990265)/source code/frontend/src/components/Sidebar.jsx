import React from 'react'
import { LayoutDashboard, Users, Zap, Activity, LogOut, Radio } from 'lucide-react'
import { useAuth } from './AuthContext'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leads',     label: 'Leads',     icon: Users },
  { id: 'rules',     label: 'Automation',icon: Zap },
  { id: 'webhook',   label: 'Test Call',  icon: Radio },
  { id: 'health',    label: 'System',     icon: Activity },
]

export default function Sidebar({ page, setPage }) {
  const { logout } = useAuth()

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoMark}>R</span>
        <div>
          <div style={styles.logoText}>RECLAIMER</div>
          <div style={styles.logoSub}>Automation Platform</div>
        </div>
      </div>

      <nav style={styles.nav}>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id}
            style={{ ...styles.navItem, ...(page === id ? styles.navActive : {}) }}
            onClick={() => setPage(id)}>
            <Icon size={16} />
            <span>{label}</span>
            {page === id && <span style={styles.navDot} />}
          </button>
        ))}
      </nav>

      <div style={styles.bottom}>
        <div style={styles.statusDot}>
          <span style={styles.dot} />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>reclaimer.onrender.com</span>
        </div>
        <button style={styles.logoutBtn} onClick={logout}>
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    width: 220, minHeight: '100vh', background: 'var(--bg2)',
    borderRight: '1px solid var(--border)', display: 'flex',
    flexDirection: 'column', padding: '24px 0', flexShrink: 0,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 28px' },
  logoMark: {
    width: 34, height: 34, background: 'var(--accent)', color: '#000',
    fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexShrink: 0,
  },
  logoText: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em' },
  logoSub: { fontSize: 10, color: 'var(--text3)', marginTop: 1 },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
    background: 'none', border: 'none', color: 'var(--text2)', borderRadius: 8,
    fontSize: 13, textAlign: 'left', transition: 'all 0.15s', position: 'relative',
    width: '100%',
  },
  navActive: { background: 'var(--bg3)', color: 'var(--text)', borderLeft: '2px solid var(--accent)', paddingLeft: 10 },
  navDot: {
    marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%',
    background: 'var(--accent)',
  },
  bottom: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  statusDot: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 },
  logoutBtn: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    background: 'none', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text3)', fontSize: 12, transition: 'all 0.15s', width: '100%',
  },
}
