import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { AuthUser } from '../types';

const TOKEN_KEY = 'pulseboard.token';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  /** True until the stored token has been checked against the API. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // A token in localStorage may be expired or issued by a backend that has
  // since been redeployed with a different secret, so it is verified once on
  // load rather than trusted.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .me(token)
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = useCallback((result: { accessToken: string; user: AuthUser }) => {
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      accept(await api.login(email, password));
    },
    [accept],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      accept(await api.register(email, password));
    },
    [accept],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

export function describeAuthError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Could not reach the API. Is the backend running?';
}
