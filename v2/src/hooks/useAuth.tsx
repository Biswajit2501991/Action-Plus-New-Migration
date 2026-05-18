import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '@/api/client';
import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthSession,
} from '@/lib/auth-storage';

export type AppUser = {
  id: string;
  name?: string;
  sections?: string[];
  access?: Record<string, unknown>;
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AppUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readAuthSession());
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async (signal?: AbortSignal) => {
    const current = readAuthSession();
    if (!current?.token) {
      setUser(null);
      setSession(null);
      return;
    }
    const me = await apiFetch<{ user: AppUser }>('/auth/me', { signal });
    if (signal?.aborted) return;
    setUser(me.user);
    setSession(current);
  }, []);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    (async () => {
      try {
        if (readAuthSession()) await refreshMe(ac.signal);
      } catch {
        if (ac.signal.aborted || !alive) return;
        clearAuthSession();
        setSession(null);
        setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [refreshMe]);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await apiFetch<{ token: string; user: AppUser }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      },
      { skipAuth: true },
    );
    writeAuthSession(result.user.id, result.token);
    setSession(readAuthSession());
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ session, user, loading, login, logout, refreshMe }),
    [session, user, loading, login, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
