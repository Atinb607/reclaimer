import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Users, MessageSquare, Zap, TrendingUp, PhoneMissed } from 'lucide-react'

const MOCK_TREND = [
  { day: 'Mon', calls: 4, sms: 3 },
  { day: 'Tue', calls: 7, sms: 6 },
  { day: 'Wed', calls: 5, sms: 4 },
  { day: 'Thu', calls: 9, sms: 8 },
  { day: 'Fri', calls: 12, sms: 10 },
  { day: 'Sat', calls: 6, sms: 5 },
  { day: 'Sun', calls: 8, sms: 7 },
]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [leads, setLeads] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      api.getStats(),
      api.getLeads(1, 5),
      api.healthDetailed(),
    ]).then(([s, l, h]) => {
      if (s.status === 'fulfilled') setStats(s.value)
      if (l.status === 'fulfilled') setLeads(l.value)
      if (h.status === 'fulfilled') setHealth(h.value)
      setLoading(false)
    })
  }, [])

  const statCards = [
    { label: 'Total Leads', value: leads?.pagination?.total ?? '—', icon: Users, color: 'var(--blue)' },
    { label: 'Rules Active', value: stats?.active_rules ?? stats?.total_rules ?? '—', icon: Zap, color: 'var(--accent)' },
    { label: 'SMS Sent', value: stats?.total_messages ?? stats?.messages_sent ?? '—', icon: MessageSquare, color: 'var(--green)' },
    { label: 'Reply Rate', value: stats?.reply_rate ? `${stats.reply_rate}%` : '—', icon: TrendingUp, color: 'var(--orange)' },
  ]

  return (
    <div style={styles.page} className="fade-in">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.sub}>Missed call automation overview</p>
        </div>
        <StatusBadge health={health} />
      </div>

      {/* Stat Cards */}
      <div style={styles.grid4}>
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={styles.cardLabel}>{label}</span>
              <div style={{ ...styles.iconBox, background: color + '18', color }}>
                <Icon size={16} />
              </div>
            </div>
            <div style={styles.cardValue}>
              {loading ? <span className="spinner" /> : value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={styles.grid2}>
        <div style={styles.card}>
          <p style={styles.chartTitle}>Weekly Activity</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={MOCK_TREND} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e8ff47" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#e8ff47" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4ecdc4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4ecdc4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#18181d', border: '1px solid #2a2a32', borderRadius: 8, color: '#f0f0f4', fontSize: 12 }} />
              <Area type="monotone" dataKey="calls" stroke="#e8ff47" strokeWidth={2} fill="url(#cg1)" name="Missed Calls" />
              <Area type="monotone" dataKey="sms" stroke="#4ecdc4" strokeWidth={2} fill="url(#cg2)" name="SMS Sent" />
            </AreaChart>
          </ResponsiveContainer>
          <div style={styles.legend}>
            <LegendItem color="#e8ff47" label="Missed Calls" />
            <LegendItem color="#4ecdc4" label="SMS Sent" />
          </div>
        </div>

        <div style={styles.card}>
          <p style={styles.chartTitle}>Daily SMS Volume</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={MOCK_TREND} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#606070', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#18181d', border: '1px solid #2a2a32', borderRadius: 8, color: '#f0f0f4', fontSize: 12 }} />
              <Bar dataKey="sms" fill="#e8ff47" radius={[4, 4, 0, 0]} name="SMS Sent" opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Leads */}
      <div style={styles.card}>
        <p style={styles.chartTitle}>Recent Leads</p>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><span className="spinner" /></div>
        ) : leads?.leads?.length ? (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Name', 'Phone', 'Status', 'Source', 'Created'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.leads.map(l => (
                <tr key={l.id} style={styles.tr}>
                  <td style={styles.td}>{l.first_name} {l.last_name}</td>
                  <td style={{ ...styles.td, fontFamily: 'var(--font-mono)', color: 'var(--text2)' }}>{l.phone}</td>
                  <td style={styles.td}><StatusChip status={l.status} /></td>
                  <td style={{ ...styles.td, color: 'var(--text3)' }}>{l.source || '—'}</td>
                  <td style={{ ...styles.td, color: 'var(--text3)' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--text3)', padding: '20px 0', fontSize: 13 }}>
            No leads yet. Test a missed call webhook to create one.
          </p>
        )}
      </div>
    </div>
  )
}

const StatusBadge = ({ health }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: health ? 'var(--green)' : 'var(--text3)', animation: health ? 'pulse 2s infinite' : 'none' }} />
    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{health ? 'All systems operational' : 'Connecting...'}</span>
  </div>
)

const LegendItem = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 10, height: 3, background: color, borderRadius: 2 }} />
    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
  </div>
)

const StatusChip = ({ status }) => {
  const colors = { new: '#4ecdc4', contacted: '#e8ff47', replied: '#2ecc71', converted: '#2ecc71', do_not_contact: '#ff4757' }
  const c = colors[status] || '#606070'
  return (
    <span style={{ fontSize: 11, color: c, background: c + '18', padding: '2px 8px', borderRadius: 20, border: `1px solid ${c}30` }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

const styles = {
  page: { padding: 32, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' },
  sub: { color: 'var(--text3)', fontSize: 13, marginTop: 2 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardLabel: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  iconBox: { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 32, display: 'flex', alignItems: 'center' },
  chartTitle: { fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 },
  legend: { display: 'flex', gap: 16, marginTop: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '12px 0', fontSize: 13, paddingRight: 16 },
}
