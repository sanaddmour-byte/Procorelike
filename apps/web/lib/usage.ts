/** Counts how often each create action is used on this device so the Create sheet can order itself by the user's own habits (plan B8/D5). */
const KEY = "siteops.createUsage";

export function bumpUsage(id: string): void {
  try {
    const cur = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    cur[id] = (cur[id] ?? 0) + 1;
    window.localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    // convenience only
  }
}

export function sortByUsage<T extends { id: string }>(items: T[]): T[] {
  try {
    const cur = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    return [...items].sort((a, b) => (cur[b.id] ?? 0) - (cur[a.id] ?? 0));
  } catch {
    return items;
  }
}
