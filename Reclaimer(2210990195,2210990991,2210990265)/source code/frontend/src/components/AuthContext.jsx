import React, { createContext, useContext, useState } from 'react'
import { getToken, setToken } from '../api'

const AuthCtx = createContext(null)

export const AuthProvider = ({ children }) => {
  const [token, setTok] = useState(() => getToken())

  const login = (tok, userData) => {
    setToken(tok)
    setTok(tok)
  }

  const logout = () => {
    setToken(null)
    setTok(null)
  }

  return (
    <AuthCtx.Provider value={{ token, login, logout, authed: !!token }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)