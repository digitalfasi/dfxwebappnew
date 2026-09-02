"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { authService, persistUser } from '@/services/authService';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<{ user: User; redirectPath: string }>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on mount: paint from cache, then confirm against
  // GET /users/me so an expired or revoked token drops the user to sign-in.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!authService.hasSession()) {
        authService.clearSession();
        setUser(null);
        setLoading(false);
        return;
      }

      const cached = authService.getCurrentUser();
      if (cached && !cancelled) setUser(cached);

      try {
        const fresh = await authService.fetchCurrentUser();
        if (!cancelled) setUser(fresh);
      } catch {
        // Access token invalid and refresh rotation failed — session is over.
        authService.clearSession();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const result = await authService.loginWithEmail(email, pass);
      setUser(result.user);
      setLoading(false);
      return result;
    } catch (err) {
      authService.clearSession();
      setUser(null);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    await authService.logout();
    setUser(null);
    setLoading(false);
  };

  /** Sync context + cache after an out-of-band update (e.g. profile edit). */
  const updateUser = (updated: User) => {
    persistUser(updated);
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role || null, loading, loginWithEmail, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
