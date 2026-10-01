/**
 * Tiny promise wrapper over IndexedDB: one database, a few named key-value stores. Used for form drafts (incl. photo
 * blobs), list view state, the offline write queue and cached lookups (plan B7, B2, C3, D2). Every call degrades to a
 * no-op / undefined when IndexedDB is unavailable (private mode, old browsers, SSR) so callers never have to guard.
 */
const DB_NAME = "siteops";
const DB_VERSION = 1;
export type Store = "drafts" | "outbox" | "state" | "cache";
const STORES: Store[] = ["drafts", "outbox", "state", "cache"];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const idbGet = <T>(store: Store, key: string): Promise<T | undefined> => run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
export const idbSet = async (store: Store, key: string, value: unknown): Promise<void> => {
  await run(store, "readwrite", (s) => s.put(value, key));
};
export const idbDel = async (store: Store, key: string): Promise<void> => {
  await run(store, "readwrite", (s) => s.delete(key));
};
export const idbKeys = async (store: Store): Promise<string[]> => ((await run(store, "readonly", (s) => s.getAllKeys())) ?? []).map(String);
export async function idbAll<T>(store: Store): Promise<{ key: string; value: T }[]> {
  const keys = await idbKeys(store);
  const out: { key: string; value: T }[] = [];
  for (const key of keys) {
    const value = await idbGet<T>(store, key);
    if (value !== undefined) out.push({ key, value });
  }
  return out;
}
