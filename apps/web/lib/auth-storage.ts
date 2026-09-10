export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; localePref: string };
}

const STORAGE_KEY = "siteops.auth";

export function loadStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: StoredAuth): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
