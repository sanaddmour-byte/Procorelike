import type { ApiErrorBody } from "@siteops/shared";
import { clearStoredAuth, loadStoredAuth, saveStoredAuth, type StoredAuth } from "./auth-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`API error (${status}): ${code}`);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const stored = loadStoredAuth();
  if (!stored) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: stored.refreshToken }),
  });
  if (!res.ok) {
    clearStoredAuth();
    return null;
  }
  const data = (await res.json()) as StoredAuth;
  saveStoredAuth(data);
  return data.accessToken;
}

/** Attaches the stored access token, and retries once through a refresh on a 401. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const stored = loadStoredAuth();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (stored) headers.set("authorization", `Bearer ${stored.accessToken}`);

  let res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && stored) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("authorization", `Bearer ${newToken}`);
      res = await fetch(`${API_URL}${path}`, { ...init, headers });
    }
  }
  return res;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(res.status, body?.error.code ?? "unknown_error");
  }
  return res.json() as Promise<T>;
}
