import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AxiosError } from 'axios';
import type { User } from '@/core/api/types';
import apiClient, { ACCESS_TOKEN_KEY } from '@/core/api/client';

/** Last profile verified by the backend, kept so a reload can show it at once. */
const USER_CACHE_KEY = 'campusflow_user';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrated from the last verified profile so pressing Ctrl+R shows the live
  // session instead of flashing the sign-in screen. The backend stays the
  // source of truth: /auth/me below replaces this snapshot, and a definitive
  // rejection clears it.
  const [user, setUser] = useState<User | null>(() => readCachedUser());
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      // A missing access token is not a failure: the httpOnly refresh cookie may
      // still be valid, and the API client uses it to mint a fresh token before
      // replaying this request.
      const { data } = await apiClient.get('/auth/me');
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.data));
      setUser(data.data);
    } catch (error) {
      const status = (error as AxiosError)?.response?.status;
      // Only a definitive rejection ends the session. Transient failures
      // (offline, backend 5xx) keep the stored credentials, so the session is
      // recovered on the next load rather than silently signed out.
      if (status === 401 || status === 403) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(USER_CACHE_KEY);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await apiClient.post('/auth/login', { email, password });
      localStorage.setItem(ACCESS_TOKEN_KEY, data.data.access_token);
      await fetchUser();
    },
    [fetchUser]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', null, { withCredentials: true });
    } finally {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(USER_CACHE_KEY);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
