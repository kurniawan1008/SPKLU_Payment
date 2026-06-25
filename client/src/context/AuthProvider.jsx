import { createContext, useContext, useState, useCallback } from 'react';
import { getToken, setToken, clearToken, decodeToken, isExpired } from '../lib/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const t = getToken();
    if (!t || isExpired(t)) {
      clearToken();
      return null;
    }
    return decodeToken(t);
  });

  const login = useCallback((token) => {
    setToken(token);
    setUser(decodeToken(token));
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
