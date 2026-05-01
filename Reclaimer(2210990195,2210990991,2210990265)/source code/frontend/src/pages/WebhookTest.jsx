import React, { useState } from 'react'
import { api } from '../api'
import { Radio, CheckCircle, AlertCircle, Send } from 'lucide-react'

export default function WebhookTest() {
  const [form, setForm] = useState({ caller_phone: '+15551234567', caller_name: 'Test User', company_id: '' })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const fire = async () => {
    setResult(null); setLoading(true)
    try {
      const data = await api.missedCall(form)
      setResult({ ok: true, data })
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page} className="fade-in">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Test Missed Call</h1>
          <p style={styles.sub}>Simulate an inbound missed call to trigger automation</p>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Form */}
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <Radio size={16} style={{ color: 'var(--accent)' }} />
            <span style={styles.cardTitle}>Webhook Payload</span>
          </div>

          <div style={styles.fields}>
            <Field label="Caller Phone" value={form.caller_phone} onChange={set('caller_phone')} placeholder="+15551234567" />
            <Field label="Caller Name" value={form.caller_name} onChange={set('caller_name')} placeholder="John Smith" />
            <Field label="Company ID (optional)" value={form.company_id} onChange={set('company_id')} placeholder="Leave blank to use default" />
          </div>

          <div style={styles.preview}>
            <span style={styles.previewLabel}>POST /webhooks/missed-call</span>
            <pre style={styles.previewCode}>{JSON.stringify({
              caller_phone: form.caller_phone,
              caller_name: form.caller_name,
              ...(form.company_id ? { company_id: form.company_id } : {}),
            }, null, 2)}</pre>
          </div>

          <button style={styles.fireBtn} onClick={fire} disabled={loading}>
            {loading ? <span className="spinner" /> : <><Send size={14} /> Fire Webhook</>}
          </button>
        </div>

        {/* Result */}
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <span style={styles.cardTitle}>Response</span>
          </div>

          {!result && !loading && (
            <div style={styles.waiting}>
              <Radio size={28} style={{ color: 'var(--text3)', marginBottom: 10 }} />
              <p>Fire the webhook to see the response</p>
            </div>
          )}

          {loading && (
            <div style={styles.waiting}>
              <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <p style={{ marginTop: 12 }}>Sending to reclaimer.onrender.com...</p>
            </div>
          )}

          {result && (
            <div className="fade-in">
              <div style={{ ...styles.resultBadge, background: result.ok ? 'rgba(46,204,113,0.1)' : 'rgba(255,71,87,0.1)', borderColor: result.ok ? 'var(--green)' : 'var(--red)', color: result.ok ? 'var(--green)' : 'var(--red)' }}>
                {result.ok
                  ? <><CheckCircle size={16} /> 202 Accepted — Webhook queued successfully</>
                  : <><AlertCircle size={16} /> Error — {result.message}</>}
              </div>

              {result.ok && (
                <>
                  <pre style={styles.responseCode}>{JSON.stringify(result.data, null, 2)}</pre>
                  <div style={styles.infoBox}>
                    <p style={styles.infoText}>✅ A lead was created or updated in the database</p>
                    <p style={styles.infoText}>✅ The webhook job was queued in Redis/BullMQ</p>
                    <p style={styles.infoText}>✅ The automation worker will process it and send an SMS</p>
                    <p style={styles.infoText}>📋 Check the Leads page to see the new entry</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Endpoint reference */}
      <div style={styles.card}>
        <p style={styles.cardTitle}>Available Webhook Endpoints</p>
        <div style={styles.endpointList}>
          {[
            { method: 'POST', path: '/webhooks/missed-call', desc: 'Simulate a missed call — creates lead + triggers automation' },
            { method: 'POST', path: '/webhooks/twilio-inbound', desc: 'Twilio inbound SMS (called by Twilio automatically)' },
            { method: 'POST', path: '/webhooks/twilio-status', desc: 'Twilio delivery status callbacks' },
            { method: 'GET',  path: '/health', desc: 'API health check' },
            { method: 'GET',  path: '/health/detailed', desc: 'DB + Redis + queue status' },
          ].map(ep => (
            <div key={ep.path} style={styles.endpoint}>
              <span style={{ ...styles.method, background: ep.method === 'GET' ? 'rgba(78,205,196,0.15)' : 'rgba(232,255,71,0.15)', color: ep.method === 'GET' ? 'var(--blue)' : 'var(--accent)' }}>{ep.method}</span>
              <code style={styles.epPath}>{ep.path}</code>
              <span style={styles.epDesc}>{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <label style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
    <input style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} {...props} />
  </div>
)

const styles = {
  page: { padding: 32, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em' },
  sub: { color: 'var(--text3)', fontSize: 13, marginTop: 2 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 14 },
  fields: { display: 'flex', flexDirection: 'column', gap: 12 },
  preview: { background: 'var(--bg3)', borderRadius: 8, overflow: 'hidden' },
  previewLabel: { display: 'block', fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', padding: '8px 12px', borderBottom: '1px solid var(--border)' },
  previewCode: { fontSize: 12, color: 'var(--text2)', padding: 12, margin: 0, fontFamily: 'var(--font-mono)', lineHeight: 1.6 },
  fireBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '12px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 14 },
  waiting: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13, textAlign: 'center' },
  resultBadge: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid', fontSize: 13, marginBottom: 16 },
  responseCode: { background: 'var(--bg3)', borderRadius: 8, padding: 14, fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0, overflow: 'auto', maxHeight: 180 },
  infoBox: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  infoText: { fontSize: 12, color: 'var(--text3)' },
  endpointList: { display: 'flex', flexDirection: 'column', gap: 10 },
  endpoint: { display: 'flex', alignItems: 'center', gap: 12 },
  method: { fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', flexShrink: 0 },
  epPath: { fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  epDesc: { fontSize: 12, color: 'var(--text3)' },
}
