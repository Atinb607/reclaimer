import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Plus, Search, ChevronLeft, ChevronRight, X } from 'lucide-react'

const STATUS_COLORS = {
  new: '#4ecdc4', contacted: '#e8ff47', replied: '#2ecc71',
  converted: '#2ecc71', do_not_contact: '#ff4757'
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = async (page = 1) => {
    setLoading(true)
    try {
      const data = await api.getLeads(page, 15)
      setLeads(data.leads || [])
      setPagination(data.pagination || { page: 1, total: 0, pages: 1 })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = leads.filter(l =>
    `${l.first_name} ${l.last_name} ${l.phone} ${l.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const addLead = async () => {
    setErr(''); setSaving(true)
    try {
      await api.createLead(form)
      setShowAdd(false)
      setForm({ first_name: '', last_name: '', phone: '', email: '' })
      load(pagination.page)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page} className="fade-in">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Leads</h1>
          <p style={styles.sub}>{pagination.total} total leads</p>
        </div>
        <button style={styles.addBtn} onClick={() => setShowAdd(true)}>
          <Plus size={15} /> Add Lead
        </button>
      </div>

      {/* Search */}
      <div style={styles.searchWrap}>
        <Search size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
        <input style={styles.searchInput} placeholder="Search by name, phone, email..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.loader}><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>
            {search ? 'No leads match your search.' : 'No leads yet. Test a missed call to create one.'}
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {['Name', 'Phone', 'Email', 'Status', 'Source', 'DNC', 'Created'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} style={styles.tr}>
                  <td style={styles.td}>
                    <span style={styles.name}>{l.first_name} {l.last_name}</span>
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>{l.phone}</td>
                  <td style={{ ...styles.td, color: 'var(--text3)', fontSize: 12 }}>{l.email || '—'}</td>
                  <td style={styles.td}><StatusChip status={l.status} /></td>
                  <td style={{ ...styles.td, color: 'var(--text3)', fontSize: 12 }}>{l.source || '—'}</td>
                  <td style={styles.td}>
                    {l.do_not_contact
                      ? <span style={{ color: 'var(--red)', fontSize: 11 }}>⛔ DNC</span>
                      : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ ...styles.td, color: 'var(--text3)', fontSize: 12 }}>
                    {new Date(l.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={styles.pag}>
          <button style={styles.pagBtn} onClick={() => load(pagination.page - 1)} disabled={pagination.page <= 1}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            Page {pagination.page} of {pagination.pages}
          </span>
          <button style={styles.pagBtn} onClick={() => load(pagination.page + 1)} disabled={pagination.page >= pagination.pages}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAdd && (
        <div style={styles.overlay} onClick={() => setShowAdd(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()} className="fade-in">
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Add Lead</span>
              <button style={styles.closeBtn} onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="First Name" value={form.first_name} onChange={set('first_name')} />
                <Field label="Last Name" value={form.last_name} onChange={set('last_name')} />
              </div>
              <Field label="Phone *" value={form.phone} onChange={set('phone')} placeholder="+15551234567" />
              <Field label="Email" value={form.email} onChange={set('email')} type="email" />
              {err && <p style={styles.err}>{err}</p>}
              <button style={styles.saveBtn} onClick={addLead} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Add Lead →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const StatusChip = ({ status }) => {
  const c = STATUS_COLORS[status] || '#606070'
  return (
    <span style={{ fontSize: 11, color: c, background: c + '18', padding: '2px 8px', borderRadius: 20, border: `1px solid ${c}30`, whiteSpace: 'nowrap' }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

const Field = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
    <input style={inputStyle} {...props} />
  </div>
)

const inputStyle = {
  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
}

const styles = {
  page: { padding: 32, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' },
  sub: { color: 'var(--text3)', fontSize: 13, marginTop: 2 },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#000',
    border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-head)',
    fontWeight: 700, fontSize: 13,
  },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 14px',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', padding: '10px 0',
    color: 'var(--text)', fontSize: 13, outline: 'none',
  },
  tableWrap: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  loader: { padding: 40, textAlign: 'center' },
  empty: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' },
  tr: { borderBottom: '1px solid var(--border)', transition: 'background 0.15s' },
  td: { padding: '12px 16px', fontSize: 13 },
  name: { fontWeight: 500 },
  pag: { display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' },
  pagBtn: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text2)', display: 'flex', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, width: 440, overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text3)', display: 'flex', alignItems: 'center' },
  modalBody: { padding: 24, display: 'flex', flexDirection: 'column', gap: 14 },
  err: { color: 'var(--red)', fontSize: 12, background: 'rgba(255,71,87,0.08)', padding: '8px 12px', borderRadius: 6 },
  saveBtn: { background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '11px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
