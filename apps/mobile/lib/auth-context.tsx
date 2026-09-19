import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearStoredAuth, loadStoredAuth, type StoredAuth } from "./auth-storage";
import { registerForPushNotifications, unregisterForPushNotifications } from "./push-notifications";

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

  // Covers both a fresh login and a restored session on app relaunch -- either
  // way, once we know who's logged in, this device should be registered for push.
  useEffect(() => {
    if (auth) void registerForPushNotifications();
  }, [auth]);

  async function logout(): Promise<void> {
    await unregisterForPushNotifications();
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
