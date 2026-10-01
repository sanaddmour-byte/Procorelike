import { apiJson } from "./api-client";
import { idbGet, idbSet } from "./idb";

/** GET that falls back to the last good response when the network is unreachable, so pickers keep working offline (plan D2). */
export async function cachedJson<T>(path: string): Promise<T> {
  try {
    const fresh = await apiJson<T>(path);
    void idbSet("cache", path, fresh);
    return fresh;
  } catch (err) {
    if (err instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      const hit = await idbGet<T>("cache", path);
      if (hit !== undefined) return hit;
    }
    throw err;
  }
}
