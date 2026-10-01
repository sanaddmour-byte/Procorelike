/**
 * Per-device UI preferences (Plan A1/G1). Kept in localStorage so they apply
 * before the user is authenticated and survive app restarts. `glove` scales
 * every hit target by ~25% and the type scale by one step (see globals.css).
 * `flags` are the rollback switches named in REMEDIATION_PLAN.md §10: every
 * flag defaults to ON and can be turned off from the console or `?ux.<flag>=0`.
 */
const KEY = "siteops.prefs";

export interface Prefs {
  glove: boolean;
  flags: Record<string, boolean>;
}

const DEFAULTS: Prefs = { glove: false, flags: {} };

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { glove: !!parsed.glove, flags: parsed.flags ?? {} };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(next: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota: the preference just won't persist.
  }
  applyPrefs(next);
  window.dispatchEvent(new Event("siteops:prefs"));
}

export function applyPrefs(prefs: Prefs = loadPrefs()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.glove = prefs.glove ? "on" : "off";
}

/** Feature flag lookup; a `?ux.<name>=0|1` query parameter overrides and is remembered. */
export function isFlagOn(name: string): boolean {
  if (typeof window === "undefined") return true;
  const prefs = loadPrefs();
  const q = new URLSearchParams(window.location.search).get(`ux.${name}`);
  if (q === "0" || q === "1") {
    savePrefs({ ...prefs, flags: { ...prefs.flags, [name]: q === "1" } });
    return q === "1";
  }
  return prefs.flags[name] ?? true;
}
