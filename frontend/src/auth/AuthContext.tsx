import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as client from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string | null) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => client.getToken());
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState<boolean>(() => client.getToken() !== null);

  useEffect(() => {
    if (!token || user) {
      setInitializing(false);
      return;
    }
    let cancelled = false;
    setInitializing(true);
    client
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) {
          client.clearToken();
          setTokenState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const login = useCallback(async (email: string, password: string) => {
    const out = await client.login({ email, password });
    client.setToken(out.access_token);
    setUser(out.user);
    setTokenState(out.access_token);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string | null) => {
    const out = await client.register({ email, password, full_name: fullName });
    client.setToken(out.access_token);
    setUser(out.user);
    setTokenState(out.access_token);
  }, []);

  const logout = useCallback(() => {
    client.clearToken();
    setUser(null);
    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, initializing, login, register, logout }),
    [user, token, initializing, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
