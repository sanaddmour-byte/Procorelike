import * as SecureStore from "expo-secure-store";

const KEY = "siteops.auth";

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; localePref: string };
}

export async function loadStoredAuth(): Promise<StoredAuth | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export async function saveStoredAuth(auth: StoredAuth): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(auth));
}

export async function clearStoredAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
