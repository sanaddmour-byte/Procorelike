import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearStoredAuth, loadStoredAuth, type StoredAuth } from "./auth-storage";

interface AuthContextValue {
  auth: StoredAuth | null;
  loading: boolean;
  setAuth: (auth: StoredAuth | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth()
      .then(setAuth)
      .finally(() => setLoading(false));
  }, []);

  async function logout(): Promise<void> {
    await clearStoredAuth();
    setAuth(null);
  }

  return <AuthContext.Provider value={{ auth, loading, setAuth, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
