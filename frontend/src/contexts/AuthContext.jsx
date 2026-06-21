import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext({
  user: null,
  loading: false,
  refresh: () => {},
  logout: () => {},
  setUser: () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth disabled — fetch the default local user from /api/auth/me (no-op endpoint)
  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    // No-op in auth-disabled mode; do not clear local user
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
