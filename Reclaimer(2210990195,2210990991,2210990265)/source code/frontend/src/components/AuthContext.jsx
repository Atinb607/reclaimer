import React, { createContext, useContext, useState, useEffect } from 'react'
import { getToken, setToken } from '../api'

const AuthCtx = createContext(null)

export const AuthProvider = ({ children }) => {
  const [token, setTok] = useState(getToken)
  const [user, setUser] = useState(null)

  const login = (tok, userData) => {
    setToken(tok)
    setTok(tok)
    setUser(userData)
  }

  const logout = () => {
    setToken(null)
    setTok(null)
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ token, user, login, logout, authed: !!token }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
