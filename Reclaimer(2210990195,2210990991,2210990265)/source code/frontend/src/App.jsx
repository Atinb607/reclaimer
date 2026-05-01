import React, { useState } from 'react'
import { AuthProvider, useAuth } from './components/AuthContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Rules from './pages/Rules'
import WebhookTest from './pages/WebhookTest'
import Health from './pages/Health'

function Inner() {
  const { authed } = useAuth()
  const [page, setPage] = useState('dashboard')

  if (!authed) return <Login />

  const pages = {
    dashboard: <Dashboard />,
    leads:     <Leads />,
    rules:     <Rules />,
    webhook:   <WebhookTest />,
    health:    <Health />,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar page={page} setPage={setPage} />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        {pages[page] || <Dashboard />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  )
}
