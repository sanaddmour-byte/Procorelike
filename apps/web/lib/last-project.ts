const KEY = "siteops.lastProject";
export function getLastProject(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setLastProject(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // convenience only
  }
}
