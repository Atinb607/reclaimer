import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Activity, RefreshCw, Database, Server, Cpu } from 'lucide-react'

export default function Health() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [last, setLast] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const h = await api.healthDetailed()
      setData(h)
      setLast(new Date())
    } catch (e) {
      setData({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fmt = (ms) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  const uptime = data?.uptime ? fmt(Math.round(data.uptime * 1000)) : '—'

  return (
    <div style={styles.page} className="fade-in">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>System Health</h1>
          <p style={styles.sub}>Live status of all services</p>
        </div>
        <button style={styles.refreshBtn} onClick={load} disabled={loading}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* API Status */}
      <div style={styles.bigCard}>
        <div style={styles.bigLeft}>
          <Server size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <p style={styles.bigLabel}>API Server</p>
            <p style={styles.bigUrl}>reclaimer.onrender.com</p>
          </div>
        </div>
        <div style={styles.bigRight}>
          <StatusPill ok={!!data && !data.error} loading={loading} />
          {data && !data.error && (
            <>
              <Metric label="Uptime" value={uptime} />
              <Metric label="Env" value={data.environment || 'production'} />
              <Metric label="Version" value={data.version || '1.0.0'} />
            </>
          )}
        </div>
      </div>

      {/* Service cards */}
      <div style={styles.grid3}>
        <ServiceCard
          icon={<Database size={18} />}
          name="PostgreSQL"
          status={data?.services?.database || data?.database}
          loading={loading}
          detail="Primary data store"
          color="var(--blue)"
        />
        <ServiceCard
          icon={<Cpu size={18} />}
          name="Redis / Valkey"
          status={data?.services?.redis || data?.redis}
          loading={loading}
          detail="Queue & cache"
          color="var(--orange)"
        />
        <ServiceCard
          icon={<Activity size={18} />}
          name="BullMQ Worker"
          status={data?.services?.queue || data?.queue}
          loading={loading}
          detail="Job processor"
          color="var(--accent)"
        />
      </div>

      {/* Raw response */}
      <div style={styles.card}>
        <div style={styles.rawHeader}>
          <span style={styles.cardTitle}>Raw Response</span>
          {last && <span style={styles.lastFetch}>Last fetched {last.toLocaleTimeString()}</span>}
        </div>
        <pre style={styles.raw}>
          {loading ? 'Fetching...' : JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

const StatusPill = ({ ok, loading }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: loading ? 'var(--bg3)' : ok ? 'rgba(46,204,113,0.12)' : 'rgba(255,71,87,0.12)', padding: '6px 14px', borderRadius: 20, border: `1px solid ${loading ? 'var(--border)' : ok ? 'rgba(46,204,113,0.3)' : 'rgba(255,71,87,0.3)'}` }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: loading ? 'var(--text3)' : ok ? 'var(--green)' : 'var(--red)', animation: ok && !loading ? 'pulse 2s infinite' : 'none' }} />
    <span style={{ fontSize: 12, color: loading ? 'var(--text3)' : ok ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
      {loading ? 'Checking...' : ok ? 'Operational' : 'Error'}
    </span>
  </div>
)

const Metric = ({ label, value }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 18 }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
  </div>
)

const ServiceCard = ({ icon, name, status, loading, detail, color }) => {
  const ok = status === true || status === 'connected' || status === 'ok' || (typeof status === 'object' && status?.status === 'connected')
  return (
    <div style={styles.serviceCard}>
      <div style={{ ...styles.serviceIcon, background: color + '15', color }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{detail}</div>
      </div>
      <StatusPill ok={ok} loading={loading} />
    </div>
  )
}

const styles = {
  page: { padding: 32, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' },
  sub: { color: 'var(--text3)', fontSize: 13, marginTop: 2 },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', color: 'var(--text2)', fontSize: 13 },
  bigCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 },
  bigLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  bigLabel: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 17 },
  bigUrl: { fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 },
  bigRight: { display: 'flex', alignItems: 'center', gap: 24 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  serviceCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 14 },
  serviceIcon: { width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },
  rawHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle: { fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14 },
  lastFetch: { fontSize: 11, color: 'var(--text3)' },
  raw: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, background: 'var(--bg3)', padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 300, margin: 0 },
}
