import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "./auth-context";
import type { StoredAuth } from "./auth-storage";

/** Redirects to /login once the stored session has finished loading and turned out empty — mirrors the web app's per-page `loadStoredAuth()` guard. */
export function useRequireAuth(): StoredAuth | null {
  const { auth, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !auth) router.replace("/login");
  }, [auth, loading, router]);

  return auth;
}
