import React, { createContext, useContext, useState } from 'react'
import { getToken, setToken, setCompanyId, getCompanyId } from '../api'

const AuthCtx = createContext(null)

export const AuthProvider = ({ children }) => {
  const [token, setTok] = useState(() => getToken())
  const [companyId, setCoId] = useState(() => getCompanyId())

  const login = (tok, userData) => {
    setToken(tok)
    setTok(tok)
    const cid = userData?.company_id || userData?.companyId || userData?.company?.id
    if (cid) { setCompanyId(cid); setCoId(cid) }
  }

  const logout = () => {
    setToken(null); setTok(null)
    setCompanyId(null); setCoId(null)
  }

  return (
    <AuthCtx.Provider value={{ token, companyId, login, logout, authed: !!token }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)