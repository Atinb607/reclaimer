import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Zap, Plus, ToggleLeft, ToggleRight, Clock, X } from 'lucide-react'

export default function Rules() {
  const [rules, setRules] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', trigger_type: 'missed_call', delay_minutes: 5, message_template: 'Hi {first_name}, we missed your call! Call us back at {company_phone} or reply here.' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [r, s] = await Promise.allSettled([api.getRules(), api.getStats()])
      if (r.status === 'fulfilled') setRules(r.value.rules || r.value || [])
      if (s.status === 'fulfilled') setStats(s.value)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const toggle = async (rule) => {
    try {
      await api.toggleRule(rule.id, !rule.is_active)
      setRules(rs => rs.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    } catch (e) { alert(e.message) }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const addRule = async () => {
    setErr(''); setSaving(true)
    try {
      await api.createRule({ ...form, delay_minutes: Number(form.delay_minutes) })
      setShowAdd(false)
      load()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={styles.page} className="fade-in">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Automation Rules</h1>
          <p style={styles.sub}>Trigger SMS sequences on missed calls</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowAdd(true)}>
          <Plus size={15} /> New Rule
        </button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div style={styles.statsStrip}>
          <Stat label="Total Rules" value={stats.total_rules ?? rules.length} />
          <Stat label="Active" value={stats.active_rules ?? rules.filter(r => r.is_active).length} accent />
          <Stat label="Jobs Queued" value={stats.jobs_queued ?? stats.pending_jobs ?? '—'} />
          <Stat label="SMS Sent" value={stats.total_messages ?? stats.messages_sent ?? '—'} />
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : rules.length === 0 ? (
        <div style={styles.empty}>
          <Zap size={32} style={{ color: 'var(--text3)', marginBottom: 12 }} />
          <p>No rules yet. Create your first automation rule.</p>
        </div>
      ) : (
        <div style={styles.ruleList}>
          {rules.map(rule => (
            <div key={rule.id} style={{ ...styles.ruleCard, ...(rule.is_active ? styles.ruleActive : {}) }}>
              <div style={styles.ruleTop}>
                <div style={styles.ruleName}>
                  <div style={{ ...styles.ruleIndicator, background: rule.is_active ? 'var(--accent)' : 'var(--border2)' }} />
                  <span style={styles.ruleTitleText}>{rule.name}</span>
                </div>
                <button style={styles.toggleBtn} onClick={() => toggle(rule)}>
                  {rule.is_active
                    ? <ToggleRight size={24} style={{ color: 'var(--accent)' }} />
                    : <ToggleLeft size={24} style={{ color: 'var(--text3)' }} />}
                </button>
              </div>

              <div style={styles.ruleMeta}>
                <MetaTag icon={<Zap size={11} />} label={rule.trigger_type?.replace(/_/g, ' ')} />
                <MetaTag icon={<Clock size={11} />} label={`${rule.delay_minutes}min delay`} />
                <span style={{ ...styles.metaTag, color: rule.is_active ? 'var(--green)' : 'var(--text3)', borderColor: rule.is_active ? 'var(--green)30' : 'var(--border)' }}>
                  {rule.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>

              {rule.message_template && (
                <div style={styles.template}>
                  <span style={styles.templateLabel}>Template</span>
                  <p style={styles.templateText}>{rule.message_template}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Rule Modal */}
      {showAdd && (
        <div style={styles.overlay} onClick={() => setShowAdd(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()} className="fade-in">
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>New Automation Rule</span>
              <button style={styles.closeBtn} onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <div style={styles.modalBody}>
              <Field label="Rule Name" value={form.name} onChange={set('name')} placeholder="e.g. Missed Call Follow-up" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Trigger</label>
                  <select style={selectStyle} value={form.trigger_type} onChange={set('trigger_type')}>
                    <option value="missed_call">Missed Call</option>
                    <option value="new_lead">New Lead</option>
                  </select>
                </div>
                <Field label="Delay (minutes)" type="number" value={form.delay_minutes} onChange={set('delay_minutes')} min="1" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={labelStyle}>Message Template</label>
                <textarea style={{ ...selectStyle, minHeight: 90, resize: 'vertical' }}
                  value={form.message_template} onChange={set('message_template')}
                  placeholder="Use {first_name}, {company_phone} as variables" />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                Variables: {'{first_name}'} {'{last_name}'} {'{company_phone}'}
              </p>
              {err && <p style={styles.err}>{err}</p>}
              <button style={styles.saveBtn} onClick={addRule} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Create Rule →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const Stat = ({ label, value, accent }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 26, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
  </div>
)

const MetaTag = ({ icon, label }) => (
  <span style={{ ...metaTagBase, color: 'var(--text3)', borderColor: 'var(--border)' }}>
    {icon}{label}
  </span>
)

const metaTagBase = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 20, border: '1px solid', background: 'var(--bg3)' }

const Field = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={labelStyle}>{label}</label>
    <input style={selectStyle} {...props} />
  </div>
)

const labelStyle = { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const selectStyle = { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }

const styles = {
  page: { padding: 32, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' },
  sub: { color: 'var(--text3)', fontSize: 13, marginTop: 2 },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 13 },
  statsStrip: { display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', gap: 16 },
  ruleList: { display: 'flex', flexDirection: 'column', gap: 12 },
  ruleCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, transition: 'border-color 0.2s' },
  ruleActive: { borderColor: 'var(--accent)30' },
  ruleTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  ruleName: { display: 'flex', alignItems: 'center', gap: 10 },
  ruleIndicator: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  ruleTitleText: { fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 16 },
  toggleBtn: { background: 'none', border: 'none', display: 'flex', alignItems: 'center', padding: 0 },
  ruleMeta: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  metaTag: metaTagBase,
  template: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 },
  templateLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 },
  templateText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  empty: { textAlign: 'center', padding: 60, color: 'var(--text3)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, width: 480, overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text3)', display: 'flex', alignItems: 'center' },
  modalBody: { padding: 24, display: 'flex', flexDirection: 'column', gap: 14 },
  err: { color: 'var(--red)', fontSize: 12, background: 'rgba(255,71,87,0.08)', padding: '8px 12px', borderRadius: 6 },
  saveBtn: { background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '11px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
