import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@/core/api/types';
import apiClient from '@/core/api/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const demoRole = localStorage.getItem('campusflow_demo_role');
    if (demoRole) {
      const demoUsers: Record<string, User> = {
        super_admin: {
          id: 'demo-admin-id',
          email: 'admin@campusflow.edu',
          first_name: 'Dr. Sarah',
          last_name: 'Jenkins',
          status: 'active',
          roles: ['super_admin', 'admin'],
        },
        faculty: {
          id: 'demo-faculty-id',
          email: 'faculty.cse@campusflow.edu',
          first_name: 'Prof. Robert',
          last_name: 'Chen',
          status: 'active',
          roles: ['faculty'],
        },
        student: {
          id: 'demo-student-id',
          email: 'student1@campusflow.edu',
          first_name: 'Alex',
          last_name: 'Rivera',
          status: 'active',
          roles: ['student'],
        },
        exam_controller: {
          id: 'demo-controller-id',
          email: 'controller@campusflow.edu',
          first_name: 'Eleanor',
          last_name: 'Vance',
          status: 'active',
          roles: ['exam_controller'],
        },
      };
      if (demoUsers[demoRole]) {
        setUser(demoUsers[demoRole]);
        setIsLoading(false);
        return;
      }
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const { data } = await apiClient.get('/auth/me');
      setUser(data.data);
    } catch {
      localStorage.removeItem('access_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post('/auth/login', { email, password });
    localStorage.setItem('access_token', data.data.access_token);
    await fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', null, { withCredentials: true });
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('campusflow_demo_role');
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
